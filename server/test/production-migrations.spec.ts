import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = process.cwd();

describe('production migration safety', () => {
  it('uses the incremental migrator during deployment', () => {
    const deploy = readFileSync(join(serverRoot, 'scripts', 'deploy-production.sh'), 'utf8');
    expect(deploy).toContain('scripts/migrate-production.mjs');
    expect(deploy).not.toMatch(/node scripts\/migrate\.mjs(?:\s|$)/);
  });

  it('never drops schemas in the production migrator', () => {
    const migrator = readFileSync(join(serverRoot, 'scripts', 'migrate-production.mjs'), 'utf8');
    expect(migrator.toLowerCase()).not.toContain('drop schema');
    expect(migrator).toContain('schema_migrations');
    expect(migrator).toContain('checksum_sha256');
    expect(migrator).toContain('pg_advisory_lock');
  });
});
