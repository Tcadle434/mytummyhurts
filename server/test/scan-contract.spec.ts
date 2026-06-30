import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AnalyzeImageDto, normalizeAnalyzeImageDto } from '../src/scan/scan.controller';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const bodyMeta: ArgumentMetadata = {
  type: 'body',
  metatype: AnalyzeImageDto,
  data: '',
};

describe('scan HTTP contract validation', () => {
  it('accepts the app image payload shape and normalizes singleton image data', async () => {
    const dto = (await pipe.transform(
      {
        requestId: 'scan-request-contract',
        imageDataUrl: 'data:image/jpeg;base64,one',
        imageDataUrls: ['data:image/jpeg;base64,one'],
        imagePath: 'user/key.jpg',
        thumbnailImagePaths: [null],
        sourceType: 'camera',
        scanCategory: 'food',
        localDate: '2026-06-23',
        timezone: 'America/Denver',
      },
      bodyMeta,
    )) as AnalyzeImageDto;

    expect(normalizeAnalyzeImageDto(dto)).toEqual({
      imageDataUrls: ['data:image/jpeg;base64,one'],
      imagePaths: ['user/key.jpg'],
    });
  });

  it('still rejects unknown scan image fields', async () => {
    await expect(
      pipe.transform(
        {
          requestId: 'scan-request-contract',
          imageDataUrls: ['data:image/jpeg;base64,one'],
          sourceType: 'camera',
          unknownField: true,
        },
        bodyMeta,
      ),
    ).rejects.toThrow();
  });
});
