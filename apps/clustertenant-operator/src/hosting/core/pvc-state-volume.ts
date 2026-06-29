import type { TenantStateVolume } from "../hosting-adapter.types.js";

/**
 * Returns the TenantStateVolume descriptor for a PVC-backed tenant state mount.
 * Used by OnPremHostingAdapter.buildStateVolume().
 */
export function _BuildPvcStateVolume(tenantName: string): TenantStateVolume
{
  return {
    volume: {
      name: "tenant-storage",
      persistentVolumeClaim: { claimName: `openclaw-${tenantName}-state` },
    },
    volumeMount: { name: "tenant-storage", mountPath: "/data/openclaw" },
    requiresPvc: true,
  };
}
