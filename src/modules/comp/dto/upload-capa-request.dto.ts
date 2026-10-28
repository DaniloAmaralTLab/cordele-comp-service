import { ApiProperty } from '@nestjs/swagger';

/**
 * Payload descriptor for cover upload (api-contract §4.3).
 *
 * Actual validation (MIME type + size cap) is performed in the controller via
 * Multer interceptors. This class documents the expected multipart part
 * for Swagger and serves as the shape reference for the unit test.
 *
 * Constraints: image/jpeg | image/png | image/webp; ≤ 10 MB (10485760 bytes).
 */
export class UploadCapaRequestDto {
  @ApiProperty({
    description:
      'Cover image binary (multipart/form-data field "file"). ' +
      'Accepted types: image/jpeg, image/png, image/webp. Maximum size: 10 MB.',
    type: 'string',
    format: 'binary',
  })
  // Typed as unknown here; the controller receives Express.Multer.File.
  readonly file!: unknown;
}
