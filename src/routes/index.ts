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
  }
}
