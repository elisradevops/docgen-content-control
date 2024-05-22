"use strict";
import * as winston from "winston";

let logsPath = process.env.logs_path || "./logs/";
const logFormat = winston.format.printf(
  (info) => `${info.timestamp} - ${info.level}: ${info.message}`
);

const logger: winston.Logger = winston.createLogger({
  format: winston.format.timestamp(),
  level: "silly",
  transports: [
    new winston.transports.File({
      filename: `${logsPath}dg-content-controls.log`,
      level: "error",
      format: logFormat,
    }),
    new winston.transports.File({
      filename: `${logsPath}dg-content-controls-all.log`,
      format: logFormat,
    }),
    new winston.transports.Console({ format: logFormat, level: "debug" }),
  ],
});

export default logger;
