import { Router } from "express";

import type { FleetOidcAuthService } from "./oidc.service.js";

/**
 * The fleet-manager's auth router: the browser OIDC login flow + session introspection.
 *
 * Mounted under `/api/v1/auth` BEFORE the auth middleware (the whole prefix is public so the
 * login flow itself is reachable without a session). It carries only the human-login surface
 * — `/login`, `/callback`, `/logout`, `/me`. The silo's per-user pod-brokering routes
 * (gateway-resolve / pod-token / device grant) are NOT part of the fleet plane.
 *
 * @param authService - The fleet OIDC auth service owning discovery, login, and session state.
 * @returns The configured auth router.
 */
export function ___FleetAuthRouter(authService: FleetOidcAuthService): Router
{
  const router = Router();

  /** Report the current auth mode and authenticated user session, if any. */
  router.get("/me", async function _me(req, res, next)
  {
    try
    {
      res.json(await authService.getStatus(req));
    }
    catch (err)
    {
      next(err);
    }
  });

  /** Start the browser-based OIDC login flow. */
  router.get("/login", async function _login(req, res, next)
  {
    try
    {
      if (!authService.isEnabled())
      {
        res.status(503).json({ error: "OIDC is not configured for this fleet-manager instance" });
        return;
      }

      const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/";
      const prompt = typeof req.query.prompt === "string" ? req.query.prompt : undefined;
      const loginUrl = await authService.buildLoginUrl(req, returnTo, { prompt });
      res.redirect(302, loginUrl);
    }
    catch (err)
    {
      next(err);
    }
  });

  /** Complete the OIDC callback and redirect back into the SPA. */
  router.get("/callback", async function _callback(req, res, next)
  {
    try
    {
      if (!authService.isEnabled())
      {
        res.status(503).json({ error: "OIDC is not configured for this fleet-manager instance" });
        return;
      }

      const returnTo = await authService.completeLogin(req);
      res.redirect(302, returnTo);
    }
    catch (err)
    {
      next(err);
    }
  });

  /**
   * Destroy the local session and, when the IdP supports it, return its RP-Initiated Logout
   * URL so the browser can finish the upstream sign-out. The local session is always
   * destroyed; `endSessionUrl` is null when OIDC is off, the IdP has no `end_session_endpoint`,
   * or the session captured no id_token.
   */
  router.post("/logout", async function _logout(req, res, next)
  {
    try
    {
      const endSessionUrl = await authService.logout(req);
      res.status(200).json({ endSessionUrl });
    }
    catch (err)
    {
      next(err);
    }
  });

  return router;
}
