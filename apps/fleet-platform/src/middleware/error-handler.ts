import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";

import { Prisma } from "../generated/prisma/index.js";

/**
 * Express 5 global error handler for the fleet-manager API. Catches any error thrown from (or
 * passed to `next()` by) a route handler — including the authz gates' `.catch(next)` — and
 * STRUCTURED-LOGS it before formatting the standard error envelope. Register AFTER all routes.
 *
 * Mirrors the clustertenant-manager handler: `detail` carries the raw message in development
 * only and is STRIPPED in production so Prisma/stack internals never reach a client. Callers
 * MUST branch on `code`, never on a human message or `detail`.
 *
 * @param log - Pino logger instance.
 */
export function _ErrorHandler(log: Logger)
{
  return function _handleError(err: unknown, req: Request, res: Response, _next: NextFunction): void
  {
    // The full error (incl. Prisma/stack) always goes to the server log — so a gate's
    // `.catch(next)` (billing/org-manager lookups, etc.) is never a silent failure.
    log.error({ err, url: req.url, method: req.method }, "unhandled request error");

    // Safety net: an unmapped Prisma unique-constraint violation (P2002) is a client conflict,
    // not a server error — return a clean 409 so the ORM message can never leak via the 500 path.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
    {
      res.status(409).json({ error: "A resource with these unique values already exists.", code: "CONFLICT" });
      return;
    }

    // Generic 500. `detail` is included in development only and STRIPPED in production.
    const body: Record<string, string> = { error: "An unexpected error occurred", code: "INTERNAL_ERROR" };
    if (process.env["NODE_ENV"] !== "production") body["detail"] = err instanceof Error ? err.message : String(err);
    res.status(500).json(body);
  };
}
