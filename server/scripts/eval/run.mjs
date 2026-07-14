// Offline/online eval runner CLI. Build first (`npm run build`), then:
//   node scripts/eval/run.mjs            # all goldens (high_trigger need OPENAI_API_KEY)
//   node scripts/eval/run.mjs --offline  # deterministic scoring goldens only
// Exits non-zero on any HARD failure (false positive / false negative).
import 'dotenv/config';

const offline = process.argv.includes('--offline');
if (offline) {
  process.env.CONCERN_V1_SHADOW_ENABLED = 'off';
  if (!process.env.OPENAI_API_KEY) process.env.DEMO_MODE = 'true';
}

const [
  { NestFactory },
  { AppModule },
  { EvalRunnerService },
  { GOLDEN_CASES },
] = await Promise.all([
  import('@nestjs/core'),
  import('../../dist/app.module.js'),
  import('../../dist/eval/eval-runner.service.js'),
  import('../../dist/eval/golden-dataset.js'),
]);
const cases = offline ? GOLDEN_CASES.filter((c) => !c.needsLlm) : GOLDEN_CASES;

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const runner = app.get(EvalRunnerService);
  const summary = await runner.run(cases, offline ? 'golden_scan_offline' : 'golden_scan_v1');
  for (const r of summary.results) {
    const mark = r.hardFailure ? '✗ HARD' : r.passed ? '✓' : '·';
    console.log(`  ${mark} ${r.name}: score=${r.score} (${r.reason})`);
  }
  console.log(`\n${summary.passed}/${summary.total} passed, ${summary.hardFailures} hard failure(s)`);
  process.exitCode = summary.hardFailures > 0 ? 1 : 0;
} finally {
  await app.close();
}
