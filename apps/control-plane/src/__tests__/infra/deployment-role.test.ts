import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _ControlPlaneRole,
  _ServesFleetSurface,
  _ServesTenantSurface,
} from "../../infra/deployment-role.js";

/**
 * S6 / ADR 0002 — the control-plane image splits its API surface by `OPENCRANE_CONTROL_PLANE_ROLE`.
 * These tests pin the role resolution + the two surface predicates that gate route mounting.
 */
describe("_ControlPlaneRole — deployment-role resolution (S6 / ADR 0002)", function _suite()
{
  let original: string | undefined;

  beforeEach(function _save() { original = process.env.OPENCRANE_CONTROL_PLANE_ROLE; });
  afterEach(function _restore()
  {
    if (original === undefined) { delete process.env.OPENCRANE_CONTROL_PLANE_ROLE; }
    else { process.env.OPENCRANE_CONTROL_PLANE_ROLE = original; }
  });

  it("defaults to central when unset (matches the Helm chart default)", function _default()
  {
    delete process.env.OPENCRANE_CONTROL_PLANE_ROLE;
    expect(_ControlPlaneRole()).toBe("central");
    expect(_ServesFleetSurface()).toBe(true);
    expect(_ServesTenantSurface()).toBe(false);
  });

  it("resolves an explicit silo role and serves only the tenant surface", function _silo()
  {
    process.env.OPENCRANE_CONTROL_PLANE_ROLE = "silo";
    expect(_ControlPlaneRole()).toBe("silo");
    expect(_ServesTenantSurface()).toBe(true);
    expect(_ServesFleetSurface()).toBe(false);
  });

  it("resolves an explicit central role and serves only the fleet surface", function _central()
  {
    process.env.OPENCRANE_CONTROL_PLANE_ROLE = "central";
    expect(_ControlPlaneRole()).toBe("central");
    expect(_ServesFleetSurface()).toBe(true);
    expect(_ServesTenantSurface()).toBe(false);
  });

  it("is case-insensitive and trims surrounding whitespace", function _normalise()
  {
    process.env.OPENCRANE_CONTROL_PLANE_ROLE = "  SILO ";
    expect(_ControlPlaneRole()).toBe("silo");
  });

  it("fails loud on an unrecognised role rather than silently mis-mounting the surface", function _failLoud()
  {
    process.env.OPENCRANE_CONTROL_PLANE_ROLE = "edge";
    expect(function _call() { _ControlPlaneRole(); }).toThrow(/OPENCRANE_CONTROL_PLANE_ROLE/);
  });
});
