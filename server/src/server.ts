import type { Server } from "node:http";
import { env } from "./config/env.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";
import { app } from "./app.js";

let server: Server | undefined;
let shuttingDown = false;

function getSafeConnectionFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const code =
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";
  const syscall =
    error instanceof Error &&
    "syscall" in error &&
    typeof error.syscall === "string"
      ? error.syscall
      : "";

  if (code === "EADDRINUSE") {
    return `HTTP port ${env.PORT} is already in use; stop the other server or configure a different PORT`;
  }

  if (code === "ECONNREFUSED" && syscall === "querySrv") {
    return "Atlas SRV DNS lookup was refused; check the machine's DNS resolver and network";
  }

  if (
    name === "MongoServerSelectionError" ||
    name === "MongooseServerSelectionError"
  ) {
    return "server selection failed; check Atlas IP access, DNS, and network reachability";
  }

  if (name === "MongoServerError") {
    return "MongoDB rejected the connection; check the database user credentials and authentication settings";
  }

  if (name === "MongoParseError" || name === "MongoInvalidArgumentError") {
    return "the connection string is invalid; check MONGODB_URI format";
  }

  return "check MONGODB_URI, Atlas network access, DNS, and database credentials";
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.info(`Received ${signal}; shutting down Ledger API.`);

  const httpServer = server;
  if (httpServer) {
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    } catch {
      console.error("HTTP server did not close cleanly.");
      process.exitCode = 1;
    }
  }

  try {
    await disconnectDatabase();
  } catch {
    console.error("MongoDB did not disconnect cleanly.");
    process.exitCode = 1;
  }
}

async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    const httpServer = app.listen(env.PORT);
    await new Promise<void>((resolve, reject) => {
      httpServer.once("listening", resolve);
      httpServer.once("error", reject);
    });

    server = httpServer;
    console.info(`Ledger API listening on port ${env.PORT}.`);
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    console.error(
      `Ledger API failed to start: ${getSafeConnectionFailure(error)}.`,
    );

    try {
      await disconnectDatabase();
    } catch {
      console.error("MongoDB cleanup after startup failure did not complete.");
    }

    process.exitCode = 1;
  }
}

void startServer();
