// Cutover: copy every object from Supabase Storage (meal-images bucket) into
// MinIO under the SAME key, so existing scan_inputs.storage_path rows resolve
// without any DB rewrite. Uses Supabase's S3-compatible Storage endpoint.
//
//   SUPABASE_S3_ENDPOINT=https://<ref>.storage.supabase.co/storage/v1/s3 \
//   SUPABASE_S3_REGION=<region> \
//   SUPABASE_S3_ACCESS_KEY=... SUPABASE_S3_SECRET_KEY=... \
//   node scripts/migrate-storage.mjs
//
// Target MinIO config is read from the same S3_* env the server uses.
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const required = ['SUPABASE_S3_ENDPOINT', 'SUPABASE_S3_ACCESS_KEY', 'SUPABASE_S3_SECRET_KEY'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Set ${required.join(', ')}.`);
    process.exit(1);
  }
}

const bucket = process.env.S3_BUCKET ?? 'meal-images';

const source = new S3Client({
  endpoint: process.env.SUPABASE_S3_ENDPOINT,
  region: process.env.SUPABASE_S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY,
  },
});

const dest = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'mthminio',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'mthminio123',
  },
});

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

try {
  let token;
  let copied = 0;
  do {
    const listed = await source.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const obj of listed.Contents ?? []) {
      const got = await source.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
      const body = await streamToBuffer(got.Body);
      await dest.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: obj.Key,
          Body: body,
          ContentType: got.ContentType,
        }),
      );
      copied++;
      if (copied % 50 === 0) console.log(`  copied ${copied}...`);
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  console.log(`Done. Copied ${copied} objects into ${bucket}.`);
} catch (err) {
  console.error('storage migration error:', err.message);
  process.exitCode = 1;
}
