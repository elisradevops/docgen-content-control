import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import logger from '../services/logger';
import DgContentControls from '../controllers';
import AzureDataService from '../services/AzureDataService';

export class Routes {
  public routes(app: any): void {
    app.route('/generate-doc-template').post(async ({ body }: Request, res: Response) => {
      try {
        const dgContentControls = new DgContentControls(
          body.orgUrl,
          body.token,
          body.attachmentsBucketName,
          body.projectName,
          body.outputType,
          body.templateUrl,
          body.minioEndPoint,
          body.minioAccessKey,
          body.minioSecretKey,
          undefined,
          body.formattingSettings
        );
        await dgContentControls.init();
        let resJson: any = await dgContentControls.generateDocTemplate();
        res.status(StatusCodes.OK).json(resJson);
      } catch (error) {
        logger.error(`content control module error : ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error });
      }
    });

    app.route('/generate-content-control').post(async ({ body }: Request, res: Response) => {
      try {
        const dgContentControls = new DgContentControls(
          body.orgUrl,
          body.token,
          body.attachmentsBucketName,
          body.projectName,
          body.outputType,
          body.templateUrl,
          body.minioEndPoint,
          body.minioAccessKey,
          body.minioSecretKey,
          undefined,
          body.formattingSettings
        );
        logger.info(`request recieved with body :
          ${JSON.stringify(body)}`);
        await dgContentControls.init();
        let resJson: any = await dgContentControls.generateContentControl(body.contentControlOptions);
        resJson.minioAttachmentData = dgContentControls.minioAttachmentData;
        const isExcelSpreadsheet = body.contentControlOptions.isExcelSpreadsheet;
        resJson.isExcelSpreadsheet = isExcelSpreadsheet;
        res.status(StatusCodes.OK).json(resJson);
      } catch (error) {
        logger.error(`content control module error : ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    // Azure DevOps data proxy endpoints
    // Management
    app.route('/azure/projects').post(async ({ body }: Request, res: Response) => {
      try {
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getProjects();
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/projects error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/check-org-url').post(async ({ body }: Request, res: Response) => {
      try {
        const svc = new AzureDataService(body.orgUrl, '');
        const data = await svc.checkOrgUrlValidity(body.token);
        res.status(StatusCodes.OK).json({ valid: true, data });
      } catch (error: any) {
        let status = error?.response?.status || error?.status;
        const message = error?.response?.data?.message || error?.message || 'Unknown error';

        // Check for network/DNS errors - check both error.code and message content
        const isNetworkError =
          error?.code === 'ENOTFOUND' ||
          error?.code === 'ECONNREFUSED' ||
          error?.code === 'ETIMEDOUT' ||
          error?.code === 'ECONNRESET' ||
          /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|getaddrinfo|Network Error/i.test(message);

        // Set status to 502 for network errors
        if (isNetworkError) {
          status = StatusCodes.BAD_GATEWAY; // 502
        } else if (!status) {
          status = StatusCodes.INTERNAL_SERVER_ERROR;
        }

        logger.error(`azure/check-org-url error (${status}): ${message}`);

        // Return the actual status code with appropriate message
        let errorMessage = message;
        if (status === 404) {
          errorMessage = 'Organization URL not found. Please verify the URL is correct.';
        } else if (status === 401 && body.token) {
          errorMessage = 'Invalid or expired Personal Access Token.';
        } else if (status === 403 && body.token) {
          errorMessage = 'Personal Access Token lacks required permissions.';
        } else if (status === StatusCodes.BAD_GATEWAY || isNetworkError) {
          errorMessage =
            'Cannot reach the organization URL. Please verify the URL is correct and accessible from this network.';
        }

        res.status(status).json({
          valid: false,
          message: errorMessage,
        });
      }
    });

    app.route('/azure/user/profile').post(async ({ body }: Request, res: Response) => {
      try {
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getUserProfile();
        res.status(StatusCodes.OK).json(data ?? {});
      } catch (error: any) {
        // Extract the actual HTTP status from the error if available
        let status = error?.response?.status || error?.status;
        const message = error?.response?.data?.message || error?.message || 'Unknown error';

        // Check for network/DNS errors - check both error.code and message content
        const isNetworkError =
          error?.code === 'ENOTFOUND' ||
          error?.code === 'ECONNREFUSED' ||
          error?.code === 'ETIMEDOUT' ||
          error?.code === 'ECONNRESET' ||
          /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|getaddrinfo|Network Error/i.test(message);

        // Set status to 502 for network errors if no HTTP status exists
        if (isNetworkError) {
          status = StatusCodes.BAD_GATEWAY; // 502
        } else if (!status) {
          status = StatusCodes.INTERNAL_SERVER_ERROR;
        }

        logger.error(`azure/user/profile error (${status}): ${message}`);

        // Return appropriate error message based on status
        let errorMessage = message;
        if (status === 401) {
          errorMessage =
            'Invalid or expired Personal Access Token. Please create a new PAT with the required scopes.';
        } else if (status === StatusCodes.BAD_GATEWAY || isNetworkError) {
          errorMessage = `Cannot reach the organization URL. Please verify the URL is correct and accessible from this network.`;
        }

        res.status(status).json({ message: errorMessage });
      }
    });

    app.route('/azure/link-types').post(async ({ body }: Request, res: Response) => {
      try {
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = (await svc.getCollectionLinkTypes()) ?? [];
        res.status(StatusCodes.OK).json(data);
      } catch (error) {
        logger.error(`azure/link-types error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    // Queries & Fields
    app.route('/azure/queries').post(async (req: Request, res: Response) => {
      try {
        const { body } = req;
        const { teamProjectId = '', docType = '', path = 'shared' } = body || {};
        logger.info(`request recieved with body : ${JSON.stringify(body)}`);
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getSharedQueries(teamProjectId, docType, path);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/queries/shared error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/fields').post(async ({ body }: Request, res: Response) => {
      try {
        const { teamProjectId = '', type = '' } = body || {};
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getFieldsByType(teamProjectId, type);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/fields error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/queries/:queryId/results').post(async (req: Request, res: Response) => {
      try {
        const { body, params } = req;
        const { teamProjectId = '' } = body || {};
        const queryId = params.queryId;
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getQueryResults(queryId, teamProjectId);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/queries/:queryId/results error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    // Tests
    app.route('/azure/tests/plans').post(async ({ body }: Request, res: Response) => {
      try {
        const { teamProjectId = '' } = body || {};
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getTestPlans(teamProjectId);
        res.status(StatusCodes.OK).json(data ?? {});
      } catch (error) {
        logger.error(`azure/tests/plans error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/tests/plans/:testPlanId/suites').post(async (req: Request, res: Response) => {
      try {
        const { body, params } = req;
        const { teamProjectId = '', includeChildren = true } = body || {};
        const testPlanId = params.testPlanId;
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getTestSuitesByPlan(
          teamProjectId,
          String(testPlanId),
          Boolean(includeChildren)
        );
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/tests/plans/:testPlanId/suites error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    // Git
    app.route('/azure/git/repos').post(async ({ body }: Request, res: Response) => {
      try {
        const { teamProjectId = '' } = body || {};
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getGitRepos(teamProjectId);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/git/repos error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/git/repos/:repoId/branches').post(async (req: Request, res: Response) => {
      try {
        const { body, params } = req;
        const { teamProjectId = '' } = body || {};
        const { repoId } = params;
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getRepoBranches(teamProjectId, repoId);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/git/repos/:repoId/branches error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/git/repos/:repoId/commits').post(async (req: Request, res: Response) => {
      try {
        const { body, params } = req;
        const { teamProjectId = '', versionIdentifier = '' } = body || {};
        const { repoId } = params;
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getRepoCommits(teamProjectId, repoId, versionIdentifier);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/git/repos/:repoId/commits error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/git/repos/:repoId/pull-requests').post(async (req: Request, res: Response) => {
      try {
        const { body, params } = req;
        const { teamProjectId = '' } = body || {};
        const { repoId } = params;
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getRepoPullRequests(teamProjectId, repoId);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/git/repos/:repoId/pull-requests error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/git/repos/:repoId/refs').post(async (req: Request, res: Response) => {
      try {
        const { body, params } = req;
        const { teamProjectId = '', type = '' } = body || {};
        const { repoId } = params;
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getRepoRefs(teamProjectId, repoId, type);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/git/repos/:repoId/refs error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    // Pipelines & Releases
    app.route('/azure/pipelines').post(async ({ body }: Request, res: Response) => {
      try {
        const { teamProjectId = '' } = body || {};
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getPipelines(teamProjectId);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/pipelines error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/pipelines/:pipelineId/runs').post(async (req: Request, res: Response) => {
      try {
        const { body, params } = req;
        const { teamProjectId = '' } = body || {};
        const { pipelineId } = params;
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getPipelineRunHistory(teamProjectId, String(pipelineId));
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/pipelines/:pipelineId/runs error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app.route('/azure/pipelines/releases/definitions').post(async ({ body }: Request, res: Response) => {
      try {
        const { teamProjectId = '' } = body || {};
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getReleaseDefinitionList(teamProjectId);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/pipelines/releases/definitions error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });

    app
      .route('/azure/pipelines/releases/definitions/:definitionId/history')
      .post(async (req: Request, res: Response) => {
        try {
          const { body, params } = req;
          const { teamProjectId = '' } = body || {};
          const { definitionId } = params;
          const svc = new AzureDataService(body.orgUrl, body.token);
          const data = await svc.getReleaseDefinitionHistory(teamProjectId, String(definitionId));
          res.status(StatusCodes.OK).json(data ?? []);
        } catch (error) {
          logger.error(`azure/pipelines/releases/definitions/:definitionId/history error: ${error.message}`);
          res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
        }
      });

    app.route('/azure/work-item-types').post(async ({ body }: Request, res: Response) => {
      try {
        const { teamProjectId = '' } = body || {};
        const svc = new AzureDataService(body.orgUrl, body.token);
        const data = await svc.getWorkItemTypeList(teamProjectId);
        res.status(StatusCodes.OK).json(data ?? []);
      } catch (error) {
        logger.error(`azure/work-item-types error: ${error.message}`);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    });
  }
}
