import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * New hashes use Node's built-in scrypt (no native build dependency). Legacy
 * Supabase bcrypt hashes are verified with bcryptjs and transparently re-hashed
 * to scrypt on the next successful login (needsRehash). The `algo` column lets
 * us swap to argon2id later without a data migration.
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<{ hash: string; algo: string }> {
    const salt = randomBytes(16);
    const dk = await scrypt(password, salt, 64);
    return { hash: `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`, algo: 'scrypt' };
  }

  async verify(
    stored: string,
    algo: string,
    password: string,
  ): Promise<{ ok: boolean; needsRehash: boolean }> {
    if (algo === 'bcrypt' || stored.startsWith('$2')) {
      const ok = await bcrypt.compare(password, stored);
      return { ok, needsRehash: ok };
    }
    const [, saltHex, hashHex] = stored.split('$');
    if (!saltHex || !hashHex) return { ok: false, needsRehash: false };
    const expected = Buffer.from(hashHex, 'hex');
    const dk = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
    const ok = dk.length === expected.length && timingSafeEqual(dk, expected);
    return { ok, needsRehash: false };
  }
}
