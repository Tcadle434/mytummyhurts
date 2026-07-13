import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = process.cwd();

describe('production migration safety', () => {
  it('uses the incremental migrator during deployment', () => {
    const deploy = readFileSync(join(serverRoot, 'scripts', 'deploy-production.sh'), 'utf8');
    expect(deploy).toContain('scripts/migrate-production.mjs');
    expect(deploy).not.toMatch(/node scripts\/migrate\.mjs(?:\s|$)/);
    const stopIndex = deploy.indexOf('stop -t 480 api');
    expect(stopIndex).toBeGreaterThanOrEqual(0);
    expect(stopIndex).toBeLessThan(deploy.indexOf('scripts/migrate-production.mjs'));
  });

  it('never drops schemas in the production migrator', () => {
    const migrator = readFileSync(join(serverRoot, 'scripts', 'migrate-production.mjs'), 'utf8');
    expect(migrator.toLowerCase()).not.toContain('drop schema');
    expect(migrator).toContain('schema_migrations');
    expect(migrator).toContain('checksum_sha256');
    expect(migrator).toContain('pg_advisory_lock');
  });

  it('refunds scans interrupted during the asynchronous cutover', () => {
    const migration = readFileSync(
      join(serverRoot, 'db', 'migrations', '20260713120000_async_scan_analysis_jobs.sql'),
      'utf8',
    );
    expect(migration).toContain('deployment_interrupted');
    expect(migration).toContain('fail_reserved_scan_analysis');
  });
});
