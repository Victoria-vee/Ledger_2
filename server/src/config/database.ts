import mongoose from "mongoose";
import { configureDnsResolver } from "./dns.js";
import { env } from "./env.js";

mongoose.connection.on("connected", () => {
  console.info("MongoDB connection established.");
});

mongoose.connection.on("disconnected", () => {
  console.info("MongoDB connection closed.");
});

mongoose.connection.on("error", () => {
  console.error("MongoDB connection error.");
});

export type DatabaseStatus =
  | "connected"
  | "connecting"
  | "disconnecting"
  | "disconnected";

export function getDatabaseStatus(): DatabaseStatus {
  switch (mongoose.connection.readyState) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "disconnected";
  }
}

export async function connectDatabase(): Promise<void> {
  await configureDnsResolver();
  console.info("Connecting to MongoDB.");
  await mongoose.connect(env.MONGODB_URI);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
