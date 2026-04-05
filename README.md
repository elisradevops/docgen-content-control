# dg-content-control

## Overview

`dg-content-control` is a backend service responsible for generating **document templates** and **content controls**
based on Azure DevOps data. It is typically called by `dg-api-gate`, but can also be used directly.

It provides:

- HTTP APIs to generate document templates (`/generate-doc-template`).
- HTTP APIs to generate individual content controls (`/generate-content-control`).
- A set of proxy endpoints under `/azure/*` to fetch Azure DevOps data (projects, queries, tests, git, pipelines).

The service combines:

- `@elisra-devops/docgen-data-provider` – to fetch data from Azure DevOps.
- `@elisra-devops/docgen-skins` – to build a JSON representation of document content.
- MinIO – to store JSON payloads and attachments.

## Running locally

### Prerequisites

- Node.js 18+
- npm

### Install and run

```bash
npm ci
npm run dev
```

The service listens on `PORT` (defaults to `3000`).

Alternatively, you can use the provided Dockerfile:

```bash
docker build -t elisradevops/docgen-content-control .
docker run -p 3000:3000 elisradevops/docgen-content-control
```

## Environment variables

Key environment variables used by the service:

- `PORT` – HTTP port to listen on (default `3000`).
- `DOWNLOAD_MANAGER_URL` – optional URL for the download manager service (logged on startup).
- `JAEGER_ENDPOINT` – Jaeger/OpenTracing collector address (logged on startup).
- Standard Node/Express/Docker environment variables as needed.

> Note: MinIO connection details (endpoint, access key, secret key, attachments bucket) are passed **per request**
> in the HTTP payload rather than via environment variables.

## HTTP API

### `POST /generate-doc-template`

Generates a **document template JSON** for a given Word/Excel template stored in MinIO.
For template-less flows (for example, Historical Query compare report), `templateUrl` may be an empty string.

#### Request body

```json
{
  "orgUrl": "https://dev.azure.com/your-org",
  "token": "your-personal-access-token",
  "projectName": "DevOps",
  "outputType": "json",
  "templateUrl": "http://templates/SRS.dotx",
  "attachmentsBucketName": "attachments",
  "minioEndPoint": "http://minio:9000",
  "minioAccessKey": "minio-user",
  "minioSecretKey": "minio-password",
  "formattingSettings": {
    "trimAdditionalSpacingInDescriptions": true,
    "trimAdditionalSpacingInTables": true
  }
}
```

#### Response

Returns a JSON template structure (document skin) that `dg-api-gate` later enriches with content controls and passes
to the json-to-word/json-to-excel service.

### `POST /generate-content-control`

Generates a **single content control** (or a group of controls) and stores the JSON in MinIO.

#### Request body

```json
{
  "orgUrl": "https://dev.azure.com/your-org",
  "token": "your-personal-access-token",
  "projectName": "DevOps",
  "attachmentsBucketName": "attachments",
  "outputType": "json",
  "templateUrl": "http://templates/SRS.dotx",
  "minioEndPoint": "http://minio:9000",
  "minioAccessKey": "minio-user",
  "minioSecretKey": "minio-password",
  "formattingSettings": {
    "trimAdditionalSpacingInDescriptions": true,
    "trimAdditionalSpacingInTables": true
  },
  "contentControlOptions": {
    "type": "query",
    "title": "required-states-and-modes",
    "headingLevel": 3,
    "data": {
      "queryId": "64f6d036-8b23-41ba-af98-fe8b93de1258",
      "skinType": "table"
    },
    "isExcelSpreadsheet": false
  }
}
```

#### Response

Returns a JSON payload describing the generated content control, plus:

- `minioAttachmentData` – list of attachments saved to MinIO.
- `isExcelSpreadsheet` – echoed from the request, used by downstream services to choose Word vs Excel.

#### Other contentControlOptions examples

The `contentControlOptions` object supports multiple `type` values. Below are some common ones.

##### `type: "test-description"`

Generates a test description table based on a test plan and selected suites.

```jsonc
"contentControlOptions": {
  "type": "test-description",
  "title": "test-description-table",
  "headingLevel": 3,
  "data": {
    "testPlanId": 148,
    "testSuiteArray": [35, 48, 125],
    "includeAttachments": true,
    "attachmentType": "asEmbedded",
    "includeHardCopyRun": false,
    "includeAttachmentContent": false,
    "includeRequirements": true,
    "includeCustomerId": false,
    "linkedMomRequest": {
      "linkedMomMode": "none"
    },
    "traceAnalysisRequest": {
      "traceAnalysisMode": "none"
    },
    "flatSuiteTestCases": false
  }
}
```

##### `type: "trace-table"`

Generates a traceability table between requirements and tests, combining a test plan/suites and a query.

```jsonc
"contentControlOptions": {
  "type": "trace-table",
  "title": "requirements-trace-table",
  "headingLevel": 4,
  "data": {
    "testPlanId": 148,
    "testSuiteArray": [35, 48],
    "queryId": "1d9333bb-a300-4443-b519-867e98624a87",
    "linkTypeFilterArray": [
      "System.LinkTypes.Hierarchy-Forward",
      "System.LinkTypes.Dependency-Forward"
    ]
  }
}
```

##### `type: "change-description-table"`

Generates a changes table based on git commits over a range, including linked work items.

```jsonc
"contentControlOptions": {
  "type": "change-description-table",
  "title": "changes-between-releases",
  "headingLevel": 3,
  "data": {
    "repoId": "<azure-devops-repo-id>",
    "from": "refs/tags/release-1.0.0",
    "to": "refs/tags/release-1.1.0",
    "rangeType": ["commit"],
    "linkTypeFilterArray": ["System.LinkTypes.Hierarchy-Forward"],
    "branchName": "refs/heads/main",
    "includePullRequests": true,
    "includeChangeDescription": true,
    "includeCommittedBy": true,
    "systemOverviewQuery": null,
    "attachmentWikiUrl": null,
    "linkedWiOptions": {},
    "workItemFilterOptions": {},
    "requestedByBuild": false,
    "includeUnlinkedCommits": false,
    "replaceTaskWithParent": false,
    "compareMode": "range"
  }
}
```

##### `type: "historical-compare-report"`

Generates a standalone Historical Query Compare report content control (no `.dotx` template is required).

```jsonc
"contentControlOptions": {
  "type": "historical-compare-report",
  "title": "historical-compare-report-content-control",
  "headingLevel": 1,
  "data": {
    "teamProjectName": "MEWP",
    "queryName": "Shared Query Name",
    "compareResult": {
      "baseline": { "asOf": "2025-12-22T17:08:00.000Z", "total": 4 },
      "compareTo": { "asOf": "2025-12-28T08:57:00.000Z", "total": 4 },
      "summary": { "updatedCount": 1 },
      "rows": []
    }
  }
}
```

### Azure DevOps proxy endpoints (`/azure/*`)

`dg-content-control` also exposes a number of helper APIs under `/azure/*` that wrap the
`@elisra-devops/docgen-data-provider` library. These are used by Skins and higher-level services to fetch data from
Azure DevOps.

All of these endpoints expect at least:

- `body.orgUrl` – Azure DevOps organization URL (e.g. `https://dev.azure.com/your-org`).
- `body.token` – Azure DevOps PAT with the required scopes.

Examples:

- `POST /azure/projects` – returns the list of team projects.
- `POST /azure/check-org-url` – validates organization URL and PAT, with rich error messages.
- `POST /azure/user/profile` – returns user profile for the PAT.
- `POST /azure/queries` – returns shared queries for a project.
- `POST /azure/tests/plans` – returns test plans.
- `POST /azure/git/repos` – returns git repositories for a project.
- `POST /azure/pipelines` – returns pipelines.

Each route may accept additional fields (e.g. `teamProjectId`, `docType`, `path`, `repoId`, `pipelineId`). See
`src/routes/index.ts` for details.

## Testing & coverage

The project uses Jest with `ts-jest`.

```bash
npm test
```

This runs all tests under `src/test/**` and generates a coverage report in `coverage/`.

The GitHub Actions workflow `.github/workflows/ci.yml` is configured to:

- Run `npm test` on pull requests (job `🧪 tests`).
- Upload the Jest coverage report as an artifact.
- Only run the Docker build/publish job after tests pass.

### Coverage guide

When you run `npm test`, Jest produces a coverage summary in the console and a detailed report under `coverage/`.

- To inspect coverage in a browser, open:

  ```bash
  open coverage/lcov-report/index.html
  ```

- The HTML report shows per-file coverage for:
  - **Statements, branches, functions, lines**.
  - **Uncovered line numbers**, which are good candidates for new tests or potential dead code.

Recommended workflow:

- Look for files or modules with low coverage and validate whether they are:
  - Critical runtime paths → add tests.
  - Legacy or unused code paths → consider refactoring or removing.
- Use the uncovered line numbers to navigate directly to missing branches/paths in `src/**`.

## Project structure

- `src/index.ts` – application entrypoint; loads env, starts Express.
- `src/app.ts` – Express app setup (not shown above, but used by `index.ts`).
- `src/routes/index.ts` – defines HTTP routes for document generation and Azure DevOps proxies.
- `src/controllers/index.ts` – `DgContentControls` class; orchestrates data factories, skins, and MinIO.
- `src/factories/*` – data factories for tests, traceability, changes, pull requests, etc.
- `src/services/AzureDataService.ts` – wraps Azure DevOps REST APIs.
- `src/services/logger.ts` – Winston-based logging.
- `src/test/**` – Jest unit and integration tests.
