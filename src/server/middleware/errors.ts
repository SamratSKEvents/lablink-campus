import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { log } from "../log.js";

/** An error with an HTTP status and a message that is safe to show users. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what, "not_found");
export const forbidden = (what = "You don't have access to this.") => new HttpError(403, what, "forbidden");

/** Wrap async route handlers so rejections reach the error handler. */
export const handle =
  <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req as R, res, next).catch(next);
  };

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Please check the highlighted fields.", code: "invalid", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON.", code: "invalid" });
    return;
  }
  log.error("unhandled", { path: req.path, message: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: "Something went wrong on our side. Please try again.", code: "internal" });
};
