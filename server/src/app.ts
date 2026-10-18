import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseStatus } from "./config/database.js";
import { env } from "./config/env.js";
import { businessRouter } from "./routes/businesses.js";
import {
  businessTransactionsRouter,
  transactionsRouter,
} from "./routes/transactions.js";
import { pricingRouter } from "./routes/pricing.js";
import { businessPricingRecordsRouter } from "./routes/pricingRecords.js";
import { aiRouter } from "./routes/ai.js";

export const app = express();

app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json());

app.get("/api/health", (_request, response) => {
  const database = getDatabaseStatus();
  const healthy = database === "connected";

  response.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "unhealthy",
    application: "ok",
    database,
  });
});

app.use("/api/businesses", businessRouter);
app.use("/api/businesses/:businessId/transactions", businessTransactionsRouter);
app.use(
  "/api/businesses/:businessId/pricing-records",
  businessPricingRecordsRouter,
);
app.use("/api/transactions", transactionsRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/ai", aiRouter);

const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (existsSync(join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
    response.sendFile("index.html", { root: clientDist });
  });
}

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    if (
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400
    ) {
      response.status(400).json({
        success: false,
        error: {
          code: "INVALID_JSON",
          message: "Request body must contain valid JSON.",
        },
      });
      return;
    }

    response.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred.",
      },
    });
  },
);
