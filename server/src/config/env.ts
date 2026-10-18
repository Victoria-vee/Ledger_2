import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGIN: z.url().default("http://localhost:5173"),
  AI_OLLAMA_BASE_URL: z
    .url()
    .default("http://127.0.0.1:11434")
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      );
    }, "AI_OLLAMA_BASE_URL must point to a local Ollama runtime"),
  AI_MODEL: z.string().trim().min(1).default("gemma3:4b"),
  AI_PRICING_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(600_000)
    .default(180_000),
  MONGODB_URI: z
    .string()
    .trim()
    .min(1, "MONGODB_URI is required")
    .refine(
      (value) => /^mongodb(?:\+srv)?:\/\//i.test(value),
      "MONGODB_URI must use the mongodb:// or mongodb+srv:// protocol",
    )
    .pipe(z.url()),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const invalidKeys = [
    ...new Set(
      parsedEnv.error.issues.map((issue) => String(issue.path[0] ?? "unknown")),
    ),
  ];
  console.error(
    `Invalid server environment configuration: ${invalidKeys.join(", ")}.`,
  );
  throw new Error("Invalid server environment configuration.");
}

export const env = parsedEnv.data;
