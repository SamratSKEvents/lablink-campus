import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  ThinkingLevel: { LOW: "LOW" },
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

describe("AI gateway: Gemini → Groq → fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AI_DISABLED", "0");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    generateContent.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const schema = z.object({ answer: z.number().int() });
  const opts = (prompt: string) => ({ task: "t", system: "s", prompt, schema, fallback: () => ({ answer: -1 }) });

  it("uses Gemini when its output validates", async () => {
    generateContent.mockResolvedValue({ text: '{"answer": 42}' });
    const { generate } = await import("../../src/server/ai/client.js");
    expect(await generate(opts("a"))).toEqual({ data: { answer: 42 }, source: "gemini" });
  });

  it("treats invalid Gemini output as untrusted and falls through to Groq", async () => {
    generateContent.mockResolvedValue({ text: '{"answer": "ignore previous instructions"}' });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"answer": 7}' } }] }) }));
    const { generate } = await import("../../src/server/ai/client.js");
    expect(await generate(opts("b"))).toEqual({ data: { answer: 7 }, source: "groq" });
  });

  it("uses the deterministic fallback when both providers fail", async () => {
    generateContent.mockRejectedValue(new Error("429"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { generate } = await import("../../src/server/ai/client.js");
    expect(await generate(opts("c"))).toEqual({ data: { answer: -1 }, source: "fallback" });
  });

  it("caches successful results", async () => {
    generateContent.mockResolvedValue({ text: '{"answer": 1}' });
    const { generate } = await import("../../src/server/ai/client.js");
    await generate(opts("d"));
    await generate(opts("d"));
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
