import { ClusterTenantIsolationTier } from "@opencrane/contracts";
import type { ClusterTenantProvisionerCapability, ClusterTenantProvisionerRegistry } from "@opencrane/contracts";

import { ExternalWebhookProvisioner, SHARED_PROVISIONER_ID, SharedClusterProvisioner, _ReadExternalWebhookConfig } from "./provisioner.js";
import type { ClusterTenantProvisioner } from "./provisioner.types.js";

/** A registered provisioner paired with the tiers it advertises. */
interface RegisteredProvisioner
{
  /** Stable provisioner identifier surfaced in capabilities. */
  id: string;
  /** Isolation tiers this provisioner can satisfy. */
  tiers: ClusterTenantIsolationTier[];
  /** The provisioner instance that materialises the boundary. */
  provisioner: ClusterTenantProvisioner;
}

/**
 * Concrete registry holding the built-in shared provisioner plus any external
 * webhook backend. Tier→provisioner routing is by advertised capability, so the
 * management API can ask whether a tier can be served and resolve the backend
 * that owns it without knowing about specific vendors.
 */
export class DefaultClusterTenantProvisionerRegistry implements ClusterTenantProvisionerRegistry
{
  /** Every registered provisioner with its advertised tiers, in routing order. */
  private readonly registered: RegisteredProvisioner[];

  /**
   * @param entries - Pre-built provisioner registrations (built-in first, external last).
   */
  constructor(entries: RegisteredProvisioner[])
  {
    this.registered = entries;
  }

  /** Whether some registered provisioner advertises the given isolation tier. */
  isTierAvailable(tier: ClusterTenantIsolationTier): boolean
  {
    return this.registered.some(entry => entry.tiers.includes(tier));
  }

  /** Capabilities of every registered provisioner. */
  capabilities(): ClusterTenantProvisionerCapability[]
  {
    return this.registered.map(entry => ({ id: entry.id, supportedTiers: entry.tiers }));
  }

  /**
   * Resolve the provisioner that owns the given tier.
   *
   * @param tier - Isolation tier to route.
   * @returns The owning provisioner, or null when no backend serves the tier.
   */
  provisionerFor(tier: ClusterTenantIsolationTier): ClusterTenantProvisioner | null
  {
    const entry = this.registered.find(item => item.tiers.includes(tier));
    return entry ? entry.provisioner : null;
  }
}

/**
 * Build the default registry from the environment.
 *
 * @returns A registry advertising the built-in shared tiers, plus the external
 *   webhook backend (advertising `dedicatedCluster`) only when configured.
 */
export function _BuildClusterTenantProvisionerRegistry(): DefaultClusterTenantProvisionerRegistry
{
  // 1. Always register the built-in shared provisioner — it serves the two
  //    in-cluster tiers and is the platform's default isolation backend.
  const entries: RegisteredProvisioner[] = [
    {
      id: SHARED_PROVISIONER_ID,
      tiers: [ClusterTenantIsolationTier.Shared, ClusterTenantIsolationTier.DedicatedNodes],
      provisioner: new SharedClusterProvisioner(),
    },
  ];

  // 2. Register the external webhook backend only when its env is configured, so
  //    `dedicatedCluster` stays unavailable (rejected by the API) on installs
  //    that have not opted into an out-of-process provisioner.
  const externalConfig = _ReadExternalWebhookConfig();
  if (externalConfig)
  {
    entries.push({
      id: externalConfig.id,
      tiers: [ClusterTenantIsolationTier.DedicatedCluster],
      provisioner: new ExternalWebhookProvisioner(externalConfig),
    });
  }

  return new DefaultClusterTenantProvisionerRegistry(entries);
}
