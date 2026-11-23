/** Structured JSON logs (Cloud Logging / Vercel friendly). Never pass secrets or tokens here. */
type Fields = Record<string, unknown>;
const out = (severity: string, msg: string, fields: Fields = {}) => {
  if (process.env.NODE_ENV === "test" && severity !== "ERROR") return;
  console.info(JSON.stringify({ severity, msg, time: new Date().toISOString(), ...fields }));
};
export const log = {
  info: (msg: string, f?: Fields) => out("INFO", msg, f),
  warn: (msg: string, f?: Fields) => out("WARNING", msg, f),
  error: (msg: string, f?: Fields) => out("ERROR", msg, f),
};
