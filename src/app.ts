import * as appInsights from "applicationinsights";
import dotenv from "dotenv";
import express, { Handler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { makeGetRequiredENVVar } from "./envs";
import { logger } from "./logs";
import { requireClientCertificate } from "./middlewares/requireClientCertificate";

dotenv.config();

const getRequiredENVVar = makeGetRequiredENVVar(logger);

const CA_CERTIFICATE_BASE64 = getRequiredENVVar("GAD_CA_CERTIFICATE_BASE64");
const CLIENT_CERTIFICATE_VERIFIED_HEADER = getRequiredENVVar(
  "GAD_CLIENT_CERTIFICATE_VERIFIED_HEADER"
);
const PROXY_TARGET = getRequiredENVVar("GAD_PROXY_TARGET");
const PROXY_CHANGE_ORIGIN =
  getRequiredENVVar("GAD_PROXY_CHANGE_ORIGIN") === "true";

function roundrobin(ips: ReadonlyArray<string>): () => string {
  // tslint:disable-next-line: no-let
  let index = 0;

  return () => {
    if (index >= ips.length) {
      index = 0;
    }
    return ips[index++];
  };
}

function unless(paths: ReadonlyArray<string>, middleware: Handler): Handler {
  return (req, res, next) => {
    if (paths.includes(req.path)) {
      return next();
    } else {
      return middleware(req, res, next);
    }
  };
}

// Start Application Insight
// tslint:disable-next-line: no-object-mutation
appInsights.setup();
appInsights.defaultClient.context.tags[
  appInsights.defaultClient.context.keys.cloudRole
] = "apigad";
appInsights.start();

const app = express();

const excludedPaths: ReadonlyArray<string> = ["/", "/ping"];

app.use(
  unless(
    excludedPaths,
    requireClientCertificate(
      CA_CERTIFICATE_BASE64,
      CLIENT_CERTIFICATE_VERIFIED_HEADER,
      logger
    )
  )
);

app.use(
  unless(
    excludedPaths,
    createProxyMiddleware({
      // tslint:disable: object-literal-sort-keys
      target: PROXY_TARGET,
      changeOrigin: PROXY_CHANGE_ORIGIN,
      logProvider: () => logger
      // tslint:enable: object-literal-sort-keys
    })
  )
);

app.get("/", (_, res) => {
  res.status(200).send();
});

app.get("/ping", (_, res) => {
  res.json({
    active: true
  });
});

app.listen(process.env.PORT || 80);
