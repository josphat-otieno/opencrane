import type { DnsProviderConfig, RenderedDnsSecret } from "./cluster-issuer.types.js";

/**
 * Thrown when a DNS-provider config cannot produce a valid solver — a token
 * provider with no token, or a non-token provider with no `solverConfig`. The
 * route maps this to a 422 via `instanceof` (not message matching).
 */
export class _DnsProviderConfigError extends Error
{
  /**
   * @param message - Human-readable description of the misconfiguration.
   */
  constructor(message: string)
  {
    super(message);
    this.name = "_DnsProviderConfigError";
  }
}

/** Default ACME directory (Let's Encrypt production) when none is supplied. */
const _DEFAULT_ACME_SERVER = "https://acme-v02.api.letsencrypt.org/directory";

/** Data key under which the DNS-provider API token is stored in its Secret. */
const _TOKEN_KEY = "api-token";

/** Providers whose DNS-01 solver references a single API token Secret. */
const _TOKEN_SOLVER_REF: Record<string, string> = {
  cloudflare: "apiTokenSecretRef",
  digitalocean: "tokenSecretRef",
};

/**
 * Render the cert-manager DNS credentials Secret for a token-based provider.
 *
 * Returns null when no token was supplied (non-token providers carry their
 * credentials in `solverConfig` / pre-existing Secrets instead).
 *
 * @param config    - The DNS-provider configuration.
 * @param namespace - Namespace the cert-manager controller reads solver Secrets from.
 * @returns The rendered Secret descriptor, or null when no token is set.
 */
export function _RenderDnsCredentialsSecret(config: DnsProviderConfig, namespace: string): RenderedDnsSecret | null
{
  if (!config.apiToken || config.apiToken.length === 0)
  {
    return null;
  }

  const name = `opencrane-dns01-${config.provider}`;
  return {
    name,
    namespace,
    key: _TOKEN_KEY,
    manifest: {
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name, namespace, labels: { "app.kubernetes.io/managed-by": "opencrane-control-plane" } },
      type: "Opaque",
      // stringData so cert-manager receives the raw token; the API server encodes it.
      stringData: { [_TOKEN_KEY]: config.apiToken },
    },
  };
}

/**
 * Render a cert-manager ACME DNS-01 `ClusterIssuer` for the given provider.
 *
 * The solver block is built from the provider: token-based providers
 * (cloudflare/digitalocean) reference `secretRef` (the Secret from
 * {@link _RenderDnsCredentialsSecret}); any other provider supplies its block
 * via `config.solverConfig`, rendered verbatim under the provider key.
 *
 * @param config    - The DNS-provider configuration.
 * @param secretRef - The credentials Secret name, or null for non-token providers.
 * @returns The `ClusterIssuer` custom-resource manifest.
 * @throws When the provider needs a token (none given) or a solver block (none given).
 */
export function _RenderDns01ClusterIssuer(config: DnsProviderConfig, secretRef: string | null): Record<string, unknown>
{
  return {
    apiVersion: "cert-manager.io/v1",
    kind: "ClusterIssuer",
    metadata: { name: config.issuerName, labels: { "app.kubernetes.io/managed-by": "opencrane-control-plane" } },
    spec: {
      acme: {
        server: config.server && config.server.length > 0 ? config.server : _DEFAULT_ACME_SERVER,
        email: config.email,
        privateKeySecretRef: { name: `${config.issuerName}-account-key` },
        solvers: [{ dns01: _BuildDns01Solver(config, secretRef) }],
      },
    },
  };
}

/**
 * Build the `dns01` solver block for a provider.
 *
 * @param config    - The DNS-provider configuration.
 * @param secretRef - The credentials Secret name, or null for non-token providers.
 * @returns The solver object keyed by the provider name.
 * @throws When neither a usable token nor a `solverConfig` is available.
 */
function _BuildDns01Solver(config: DnsProviderConfig, secretRef: string | null): Record<string, unknown>
{
  const refField = _TOKEN_SOLVER_REF[config.provider];

  // 1. Token-based provider with a stored Secret — wire the standard secretRef.
  if (refField && secretRef)
  {
    return { [config.provider]: { [refField]: { name: secretRef, key: _TOKEN_KEY } } };
  }

  // 2. Any provider with an explicit solver block — render it verbatim.
  if (config.solverConfig && Object.keys(config.solverConfig).length > 0)
  {
    return { [config.provider]: config.solverConfig };
  }

  // 3. Nothing to build — surface a typed configuration error (mapped to 422).
  if (refField)
  {
    throw new _DnsProviderConfigError(`provider '${config.provider}' requires an apiToken (none supplied)`);
  }
  throw new _DnsProviderConfigError(`provider '${config.provider}' requires a solverConfig block (none supplied)`);
}
