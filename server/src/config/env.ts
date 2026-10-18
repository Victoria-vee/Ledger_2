import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGIN: z.url().default("http://localhost:5173"),
  OPENAI_API_KEY: z.string().trim().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-4o-mini"),
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
