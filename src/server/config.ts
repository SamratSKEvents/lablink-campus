/**
 * Validated runtime configuration. Secrets come from the environment
 * (.env locally, Vercel/Secret Manager in production) and are never logged.
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(8080),
  CARD_HMAC_SECRET: z.string().min(16, "CARD_HMAC_SECRET must be at least 16 characters"),
  FIREBASE_PROJECT_ID: z.string().default("demo-lablink"),
  /** Service-account JSON as a string (Vercel). On Cloud Run, Application Default Credentials are used instead. */
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  AI_DISABLED: z.enum(["0", "1"]).default("0"),
  /** Comma-separated origins allowed for CORS (same-origin needs nothing). */
  ALLOWED_ORIGINS: z.string().default(""),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;
export function config(): Config {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const aiEnabled = () => config().AI_DISABLED !== "1" && Boolean(config().GEMINI_API_KEY || config().GROQ_API_KEY);
