import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import logger from '../services/logger';
import DgContentControls from '../controllers';

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
          body.minioSecretKey
        );
        await dgContentControls.init();
        let resJson: any = await dgContentControls.generateDocTemplate();
        res.status(StatusCodes.OK).json(resJson);
      } catch (error) {}
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
          body.minioSecretKey
        );
        logger.info(`request recieved with body :
          ${JSON.stringify(body)}`);
        await dgContentControls.init();
        let resJson: any = await dgContentControls.generateContentControl(body.contentControlOptions);
        resJson.minioAttachmentData = dgContentControls.minioAttachmentData;
        res.status(StatusCodes.OK).json(resJson);
      } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(error);
        logger.error(`server error : ${JSON.stringify(error)}`);
      }
    });
  }
}
