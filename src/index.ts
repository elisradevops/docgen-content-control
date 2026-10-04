import dotenv from "dotenv";
dotenv.config();
import App from "./app";
import logger from "./services/logger";
import { installHttpLogSink } from "./services/diagnostics/httpLogSink";
import { applyServerTimeouts } from "./services/serverTimeouts";

const app = new App();
const diagnosticsSink = installHttpLogSink();

const server = app.app.listen(process.env.PORT || 3000, () => {
  logger.info(`listening on port ${process.env.PORT || 3000}`);
  logger.info(`dowload manager url: ${process.env.DOWNLOAD_MANAGER_URL}`);
  logger.info(`jaeger open-trace collector ip: ${process.env.JAEGER_ENDPOINT}`);
});
applyServerTimeouts(server);

// No graceful shutdown existed here before Phase 6a — added so a buffered-but-unflushed
// diagnostics batch isn't silently dropped on a pod termination. The Dockerfile CMD is exec
// form (`node index.js`), so this process is PID 1 and receives SIGTERM directly.
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down`);
  diagnosticsSink?.stop();
  await diagnosticsSink?.flush(true);
  server.close(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
