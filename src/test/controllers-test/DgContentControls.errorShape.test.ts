import DgContentControls from '../../controllers';

const mockFPutObject = jest.fn();

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({ fPutObject: (...args: unknown[]) => mockFPutObject(...args) })),
}));

jest.mock('../../services/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@elisra-devops/docgen-skins', () =>
  jest.fn().mockImplementation(() => ({ getDocumentSkin: jest.fn().mockReturnValue({}) }))
);

jest.mock('@elisra-devops/docgen-data-provider', () => jest.fn());

// The route reads error.message and error.code. A string rejection has neither, which is how a
// MinIO "bucket does not exist" reached the caller as `{ message: undefined }`.
describe('DgContentControls failure shape', () => {
  const createController = () =>
    new DgContentControls('https://dev.azure.com/org/', 'pat', 'attachments', 'MEWP', 'json', '', 'minio:9000', 'AKEY-SECRET-1', 'SKEY-SECRET-2');
  const jsonLocalData = { localJsonPath: './content-controls/x.json', jsonName: 'x.json' };

  beforeEach(() => jest.clearAllMocks());

  test('uploadToMinio rejects with an Error carrying the S3 code and the bucket name', async () => {
    mockFPutObject.mockRejectedValueOnce(
      Object.assign(new Error('The specified bucket does not exist'), { code: 'NoSuchBucket' })
    );

    const error: any = await createController()
      .uploadToMinio(jsonLocalData, 'minio:9000', 'content-controls')
      .catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('issue uploading to minio due to');
    expect(error.message).toContain('The specified bucket does not exist');
    expect(error.code).toBe('NoSuchBucket');
    expect(error.bucketName).toBe('content-controls');
  });

  test('uploadToMinio never puts the credentials in the error', async () => {
    mockFPutObject.mockRejectedValueOnce(new Error('boom'));

    const error: any = await createController()
      .uploadToMinio(jsonLocalData, 'minio:9000', 'content-controls')
      .catch((e) => e);

    expect(JSON.stringify({ message: error.message, ...error })).not.toMatch(/KEY-SECRET/);
  });

  test('uploadToMinio still rejects with an Error when the client throws synchronously', async () => {
    mockFPutObject.mockImplementationOnce(() => {
      throw new Error('sync failure');
    });

    const error: any = await createController()
      .uploadToMinio(jsonLocalData, 'minio:9000', 'content-controls')
      .catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('sync failure');
  });
});
