import { describe, expect, it } from "vitest";

import { _ResolveIdentityClaims } from "../../infra/auth/oidc.service.js";

/** Default claim names with one configured operator group, mirroring the loader defaults. */
const _CONFIG = {
  groupsClaim: "groups",
  rolesClaim: "roles",
  platformOperatorGroups: ["opencrane-operators"],
};

describe("_ResolveIdentityClaims — groups + isPlatformOperator projection (WOI.1)", function _suite()
{
  it("marks the caller a platform operator when a groups-claim value matches a configured operator group", function _operatorViaGroups()
  {
    const result = _ResolveIdentityClaims({ groups: ["Acme-Users", "OpenCrane-Operators"] }, _CONFIG);

    expect(result.isPlatformOperator).toBe(true);
    expect(result.groups).toEqual(["Acme-Users", "OpenCrane-Operators"]);
  });

  it("matches operator groups case-insensitively and also reads the roles claim", function _operatorViaRoles()
  {
    const result = _ResolveIdentityClaims({ roles: "opencrane-operators" }, _CONFIG);

    expect(result.isPlatformOperator).toBe(true);
    expect(result.groups).toEqual(["opencrane-operators"]);
  });

  it("is not a platform operator when no group matches", function _notOperator()
  {
    const result = _ResolveIdentityClaims({ groups: ["acme-admins"] }, _CONFIG);

    expect(result.isPlatformOperator).toBe(false);
  });

  it("nobody is a platform operator when no operator groups are configured (fail-closed)", function _emptyOperatorSet()
  {
    const result = _ResolveIdentityClaims({ groups: ["opencrane-operators"] }, { ..._CONFIG, platformOperatorGroups: [] });

    expect(result.isPlatformOperator).toBe(false);
  });

  it("returns an empty group list and is not an operator when neither claim is present", function _noGroups()
  {
    const result = _ResolveIdentityClaims({}, _CONFIG);

    expect(result.groups).toEqual([]);
    expect(result.isPlatformOperator).toBe(false);
  });
});
