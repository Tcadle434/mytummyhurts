import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';

import { extForContentType, parseDataUrl } from './image-data';

const SIGNED_URL_TTL_SECONDS = 600; // matches the old createSignedStorageUrl TTL

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'meal-images';
    this.s3 = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT'),
      region: config.get<string>('S3_REGION') ?? 'us-east-1',
      forcePathStyle: (config.get<string>('S3_FORCE_PATH_STYLE') ?? 'true') !== 'false',
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket ${this.bucket}`);
    } catch {
      // Bucket already exists / owned — fine.
    }
  }

  // Key format matches the original pipeline so migrated objects resolve as-is.
  private buildKey(userId: string, index: number, ext: string): string {
    return `${userId}/${Date.now()}-${randomBytes(4).toString('hex')}-${index}-${randomUUID()}.${ext}`;
  }

  /** Compatibility path: app sends inline base64; we store it and return the key. */
  async putInlineImage(userId: string, dataUrl: string, index = 0): Promise<string> {
    const { buffer, contentType, ext } = parseDataUrl(dataUrl);
    const key = this.buildKey(userId, index, ext);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: '604800',
      }),
    );
    return key;
  }

  /** Preferred path: hand the client a presigned PUT URL to upload directly. */
  async createUploadUrl(
    userId: string,
    contentType: string,
    index = 0,
  ): Promise<{ key: string; uploadUrl: string }> {
    const key = this.buildKey(userId, index, extForContentType(contentType));
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
    return { key, uploadUrl };
  }

  /** Signed GET URL rendered as `imageUri` in scan results. */
  signUrl(key: string, expiresIn = SIGNED_URL_TTL_SECONDS): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn,
    });
  }

  async removeKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }

  /** account-delete: wipe a user's entire prefix. */
  async removePrefix(userId: string): Promise<void> {
    let token: string | undefined;
    do {
      const listed = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${userId}/`,
          ContinuationToken: token,
        }),
      );
      const keys = (listed.Contents ?? []).map((o) => o.Key!).filter(Boolean);
      await this.removeKeys(keys);
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
  }

  async ping(): Promise<void> {
    await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, MaxKeys: 1 }));
  }
}
