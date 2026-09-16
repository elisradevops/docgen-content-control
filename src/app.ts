import express from "express";
import * as bodyParser from "body-parser";
import { Routes } from "./routes";

//add metrics route , for monitoring
const promBundle = require("express-prom-bundle");

const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: {
    project_name: "hello_world",
    project_type: "test_metrics_labels",
  },
  promClient: {
    collectDefaultMetrics: {},
  },
});

export default class App {
  public app: express.Application;
  public routePrv: Routes = new Routes();

  constructor() {
    this.app = express();
    this.config();
    this.routePrv.routes(this.app);
  }

  private config(): void {
    this.app.use(metricsMiddleware);
    // No explicit limit here used to mean body-parser's 100kb default, which
    // the Historical Query compare-report content control (can run into
    // several MB) exceeds. Env-overridable, matching docgen-api-gate's
    // upstream limit so both hops accept the same request.
    const jsonBodyLimitBytes = Number(process.env.API_JSON_BODY_MAX_BYTES || 50 * 1024 * 1024);
    this.app.use(bodyParser.json({ limit: jsonBodyLimitBytes }));
    this.app.use(bodyParser.urlencoded({ extended: false, limit: jsonBodyLimitBytes }));
  }
}