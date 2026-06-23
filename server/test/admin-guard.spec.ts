import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { InternalSecretGuard } from '../src/admin/internal-secret.guard';

const config = { get: (k: string) => (k === 'ADMIN_API_SECRET' ? 'sekret' : undefined) } as unknown as ConfigService;
const guard = new InternalSecretGuard(config);
const ctx = (headers: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

describe('InternalSecretGuard', () => {
  it('allows requests with the correct x-internal-secret', () => {
    expect(guard.canActivate(ctx({ 'x-internal-secret': 'sekret' }))).toBe(true);
  });

  it('allows a Bearer token matching the secret', () => {
    expect(guard.canActivate(ctx({ authorization: 'Bearer sekret' }))).toBe(true);
  });

  it('rejects a missing secret', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow();
  });

  it('rejects a wrong secret', () => {
    expect(() => guard.canActivate(ctx({ 'x-internal-secret': 'nope' }))).toThrow();
  });
});
