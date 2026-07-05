// One-shot asset prep: brand-kit Pip masters (1024px PNG, ~200-250KB each) ->
// 480px WebP with alpha, committed under public/assets/pip/. Run only when the
// art changes; other machines never need brand-kit because outputs are committed.
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import sharp from 'sharp';

const MASTERS_DIR = resolve(import.meta.dirname, '../../../../brand-kit/assets/mascot/pip');
const OUT_DIR = resolve(import.meta.dirname, '../public/assets/pip');
const TARGET_SIZE = 480;
const WEBP_QUALITY = 82;

if (!existsSync(MASTERS_DIR)) {
  console.error(`brand-kit masters not found at ${MASTERS_DIR}; outputs are committed, nothing to do.`);
  process.exit(1);
}

// Only poses the page actually renders; keep in sync with src/components/Pip.tsx.
const USED_POSES = ['thinking', 'waving', 'joyous', 'love', 'anxious', 'sleepy'];

await mkdir(OUT_DIR, { recursive: true });
const files = (await readdir(MASTERS_DIR)).filter(
  (f) => f.endsWith('_transparent.png') && USED_POSES.some((pose) => f.includes(pose)),
);
for (const file of files) {
  const name = basename(file, '_transparent.png').replace(/_/g, '-');
  const outPath = join(OUT_DIR, `${name}.webp`);
  const output = await sharp(join(MASTERS_DIR, file))
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'inside' })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outPath);
  console.log(`${outPath} ${Math.round(output.size / 1024)}KB`);
}
