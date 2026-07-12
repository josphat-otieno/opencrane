import type { OpenClawTenantOperatorConfig } from "../app/config.js";
import { HostingProvider, type HostingAdapter } from "./hosting-adapter.types.js";
import { OnPremHostingAdapter } from "./adapters/onprem/onprem-hosting.adapter.js";
import { GcpHostingAdapter } from "./adapters/gcp/gcp-hosting.adapter.js";
import { GcpBucketClient } from "./adapters/gcp/gcp-bucket.client.js";

/**
 * Construct the hosting adapter for the configured provider.
 * Defaults to on-prem when HOSTING_PROVIDER is unset or unrecognised.
 *
 * This is the single decision point where cloud selection happens.
 * Everything downstream (reconcile loop, builders) is provider-agnostic.
 *
 * @param config - Operator configuration.
 * @returns The active hosting adapter.
 */
export function _BuildHostingAdapter(config: OpenClawTenantOperatorConfig): HostingAdapter
{
  // 1. Branch once, here, on the configured provider.
  switch (config.hostingProvider)
  {
    case HostingProvider.Gcp:
      // 2. GCP adapter requires the gcp config block and a live GCS client.
      return new GcpHostingAdapter(config.gcp!, new GcpBucketClient(config.gcp!.projectId));

    case HostingProvider.OnPrem:
    default:
      // 3. On-prem requires no cloud configuration whatsoever.
      return new OnPremHostingAdapter();
  }
}
