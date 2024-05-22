import dotenv from "dotenv";
dotenv.config();
import App from "./app";
import logger from "./services/logger";

const app = new App();

const server = app.app.listen(process.env.PORT || 3000, () => {
  logger.info(`listening on port ${process.env.PORT || 3000}`);
  logger.info(`dowload manager url: ${process.env.DOWNLOAD_MANAGER_URL}`);
  logger.info(`jaeger open-trace collector ip: ${process.env.JAEGER_ENDPOINT}`);
});
