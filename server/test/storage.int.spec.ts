import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { StorageModule } from '../src/storage/storage.module';
import { StorageService } from '../src/storage/storage.service';

// 1x1 transparent PNG.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const DATA_URL = `data:image/png;base64,${PNG_B64}`;

let storage: StorageService;
const USER = '44444444-4444-4444-4444-444444444444';

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), StorageModule],
  }).compile();
  await moduleRef.init(); // triggers onModuleInit (bucket creation)
  storage = moduleRef.get(StorageService);
});

describe('storage (MinIO)', () => {
  it('stores an inline image and the signed URL round-trips the same bytes', async () => {
    const key = await storage.putInlineImage(USER, DATA_URL, 0);
    expect(key.startsWith(`${USER}/`)).toBe(true);
    expect(key.endsWith('.png')).toBe(true);

    const url = await storage.signUrl(key);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(Buffer.from(PNG_B64, 'base64'))).toBe(true);
  });

  it('presigned upload URL accepts a PUT and is then readable (parity with inline)', async () => {
    const { key, uploadUrl } = await storage.createUploadUrl(USER, 'image/png', 1);
    const body = Buffer.from(PNG_B64, 'base64');
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body,
    });
    expect(put.status).toBe(200);

    const url = await storage.signUrl(key);
    const got = await fetch(url);
    const bytes = Buffer.from(await got.arrayBuffer());
    expect(bytes.equals(body)).toBe(true);
  });
});
