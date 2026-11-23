/**
 * One gateway for every model call: Gemini (primary) → Groq (fallback) → deterministic template.
 * Output is always validated with zod and treated as untrusted. Every call logs latency,
 * source, cache hits and validation failures, without the prompt (it may hold user text).
 */
import { createHash } from "node:crypto";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { aiEnabled, config } from "../config.js";
import { log } from "../log.js";

export type AiSource = "gemini" | "groq" | "fallback";
export interface AiResult<T> {
  data: T;
  source: AiSource;
}

interface GenerateOptions<T> {
  /** Short name for logs/metrics, e.g. "plan". */
  task: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  fallback: () => T;
  ttlMs?: number;
  timeoutMs?: number;
}

const TTL_DEFAULT = 10 * 60_000;
const MAX_CACHE = 500;
const cache = new Map<string, { at: number; ttl: number; value: AiResult<unknown> }>();
const inflight = new Map<string, Promise<AiResult<unknown>>>();

let gemini: GoogleGenAI | null = null;
const geminiClient = () => (gemini ??= new GoogleGenAI({ apiKey: config().GEMINI_API_KEY! }));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

const VALIDATION_ONLY = new Set(["$schema", "pattern", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "additionalProperties", "format"]);

/** Strip validation-only keywords recursively: the model gets the shape, zod enforces the limits. */
function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => !VALIDATION_ONLY.has(k)).map(([k, v]) => [k, strip(v)]));
}

/** JSON Schema for the model: structure only, so it stays within serving limits. */
function modelSchema(schema: z.ZodType): Record<string, unknown> {
  return strip(z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any", io: "input" })) as Record<string, unknown>;
}

function parseJson(text: string | undefined): unknown {
  if (!text) throw new Error("empty response");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned);
}

async function callGemini(o: GenerateOptions<unknown>, signalMs: number): Promise<unknown> {
  const ask = (structured: boolean) =>
    withTimeout(
      geminiClient().models.generateContent({
        model: config().GEMINI_MODEL,
        contents: o.prompt,
        config: {
          systemInstruction: structured ? o.system : `${o.system}
Reply with JSON only, matching this JSON Schema:
${JSON.stringify(modelSchema(o.schema))}`,
          responseMimeType: "application/json",
          ...(structured ? { responseJsonSchema: modelSchema(o.schema) } : {}),
          temperature: 0.2,
          // Structured extraction, not reasoning puzzles: low thinking keeps latency down.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      signalMs,
    );
  try {
    return parseJson((await ask(true)).text);
  } catch (e) {
    // Some schemas exceed the serving limits for constrained decoding: fall back to prompt-described JSON.
    if (e instanceof Error && /schema/i.test(e.message)) return parseJson((await ask(false)).text);
    throw e;
  }
}

async function callGroq(o: GenerateOptions<unknown>, signalMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), signalMs);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${config().GROQ_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: config().GROQ_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${o.system}\nReply with JSON only, matching this JSON Schema:\n${JSON.stringify(modelSchema(o.schema))}` },
          { role: "user", content: o.prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`groq ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseJson(body.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(t);
  }
}

/** Run a structured generation with caching, in-flight de-duplication and fallbacks. */
export async function generate<T>(o: GenerateOptions<T>): Promise<AiResult<T>> {
  const key = createHash("sha256").update(`${o.task}\n${o.system}\n${o.prompt}`).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) {
    log.info("ai", { task: o.task, source: hit.value.source, cache: true });
    return hit.value as AiResult<T>;
  }
  const running = inflight.get(key);
  if (running) return running as Promise<AiResult<T>>;

  const job = (async (): Promise<AiResult<T>> => {
    const started = Date.now();
    const timeoutMs = o.timeoutMs ?? 12_000;
    const attempts: [AiSource, () => Promise<unknown>][] = [];
    if (aiEnabled()) {
      if (config().GEMINI_API_KEY) attempts.push(["gemini", () => callGemini(o as GenerateOptions<unknown>, timeoutMs)]);
      if (config().GROQ_API_KEY) attempts.push(["groq", () => callGroq(o as GenerateOptions<unknown>, timeoutMs)]);
    }
    // One quick retry for transient network/overload errors before moving to the next provider.
    const transient = (e: unknown) => e instanceof Error && /fetch failed|ECONNRESET|UND_ERR|"code":503|overloaded|high demand/i.test(e.message);
    const withRetry = async (run: () => Promise<unknown>) => {
      try {
        return await run();
      } catch (e) {
        if (!transient(e)) throw e;
        await new Promise((r) => setTimeout(r, 600));
        return run();
      }
    };
    for (const [source, run] of attempts) {
      try {
        const parsed = o.schema.safeParse(await withRetry(run));
        if (parsed.success) {
          const result = { data: parsed.data, source };
          log.info("ai", { task: o.task, source, ms: Date.now() - started });
          remember(key, result, o.ttlMs ?? TTL_DEFAULT);
          return result;
        }
        log.warn("ai_validation_failed", { task: o.task, source, issues: parsed.error.issues.length });
      } catch (e) {
        log.warn("ai_call_failed", { task: o.task, source, reason: e instanceof Error ? e.message.slice(0, 120) : "unknown" });
      }
    }
    const result = { data: o.fallback(), source: "fallback" as const };
    log.info("ai", { task: o.task, source: "fallback", ms: Date.now() - started });
    return result;
  })();

  inflight.set(key, job as Promise<AiResult<unknown>>);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

function remember(key: string, value: AiResult<unknown>, ttl: number) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), ttl, value });
}

/** Test hook. */
export function clearAiCache() {
  cache.clear();
}
