// Regression for the missed-JFrog-error incident: Azure DevOps answers a service-connection read from an
// identity without a role on it with HTTP 200 and an empty body (not a 403). Nothing here mocks the code
// under test: a local HTTP server plays Azure DevOps, and the real data-provider package (TFSServices +
// JfrogDataProvider) and the real ChangeDataFactory run against it.
import http from 'http';
import type { AddressInfo } from 'net';
import DgDataProviderAzureDevOps from '@elisra-devops/docgen-data-provider';
import ChangeDataFactory from '../../factories/ChangeDataFactory';
import logger from '../../services/logger';

jest.mock('../../services/logger');

const CONNECTION_ID = '11111111-2222-3333-4444-555555555555';
const ENDPOINT_PATH = `/proj/_apis/serviceendpoint/endpoints/${CONNECTION_ID}`;

describe('JFrog service connection that the caller cannot read (empty 200)', () => {
  let server: http.Server;
  let orgUrl: string;
  let endpointBody: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if ((req.url || '').startsWith(ENDPOINT_PATH)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(endpointBody);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    orgUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    endpointBody = '';
  });

  const makeFactory = (provider: DgDataProviderAzureDevOps) =>
    new (ChangeDataFactory as any)(
      'proj', '', '1', '2', 'release', null, '', true, false, '', false, false,
      provider, 'bucket', 'minio', 'key', 'secret', 'pat', 'toc', undefined, new Set<number>()
    );

  const relArt = (version: string) => ({
    definitionReference: {
      connection: { id: CONNECTION_ID, name: 'JFrog-Prod' },
      definition: { name: 'build-art', id: '3' },
      version: { name: version },
    },
  });

  test('the factory path rejects with an error naming the connection and the missing permission', async () => {
    const provider = new DgDataProviderAzureDevOps(orgUrl, 'pat');
    const jfrog = await provider.getJfrogDataProvider();
    const factory = makeFactory(provider);

    const run = factory.processArtifactoryArtifactPair(
      'k', 'art1', 'Artifactory art1', { id: 1 }, { id: 2, createdOn: '2024-01-02T00:00:00Z' },
      relArt('1.0.0'), relArt('2.0.0'), '2.0.0', '2024-01-02T00:00:00Z', jfrog, new Map()
    );

    await expect(run).rejects.toThrow(/returned no URL/i);
    await expect(run).rejects.toThrow(/JFrog-Prod/);
    await expect(run).rejects.toThrow(new RegExp(CONNECTION_ID));
  });

  test('the same call succeeds once the identity can read the connection (positive control)', async () => {
    endpointBody = JSON.stringify({ id: CONNECTION_ID, url: 'https://jfrog.example.com' });
    const provider = new DgDataProviderAzureDevOps(orgUrl, 'pat');
    const jfrog = await provider.getJfrogDataProvider();

    await expect(jfrog.getServiceConnectionUrlByConnectionId('proj', CONNECTION_ID)).resolves.toBe(
      'https://jfrog.example.com'
    );
  });
});
