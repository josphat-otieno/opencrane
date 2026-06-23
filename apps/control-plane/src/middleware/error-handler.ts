import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";

/**
 * Express 5 global error handler. Catches any error thrown from (or passed to
 * next() by) a route handler and formats it into the standard error envelope.
 *
 * Register this AFTER all routes so Express selects it only for errors.
 *
 * `detail` is intentionally omitted from the response body — Prisma messages,
 * stack traces, and ORM internals must never reach a client. The full error is
 * still logged server-side for diagnostics.
 *
 * @param log - Pino logger instance.
 */
export function _ErrorHandler(log: Logger)
{
  return function _handleError(err: unknown, req: Request, res: Response, _next: NextFunction): void
  {
    log.error({ err, url: req.url, method: req.method }, "unhandled request error");
    res.status(500).json({ error: "An unexpected error occurred", code: "INTERNAL_ERROR" });
  };
}
