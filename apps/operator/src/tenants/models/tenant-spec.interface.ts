/**
 * Specification for a Tenant custom resource, defining the desired state
 * of an OpenCrane tenant deployment.
 */
export interface TenantSpec
{
  /** Human-readable name for the tenant. */
  displayName: string;

  /** Contact email for the tenant owner. */
  email: string;

  /** Optional team identifier for grouping tenants. */
  team?: string;

  /** Custom container image override for the tenant pod. */
  openclawImage?: string;

  /** OpenClaw version to install (e.g. "latest", "2026.3.15"). Defaults to "latest". */
  openclawVersion?: string;

  /** Optional monthly budget for the tenant's LiteLLM virtual key (USD). */
  monthlyBudgetUsd?: number;

  /** Resource requests for the tenant container. */
  resources?: {
    /** CPU resource request (e.g. "500m"). */
    cpu?: string;
    /** Memory resource request (e.g. "256Mi"). */
    memory?: string;
  };

  /** List of skill names to enable for this tenant (legacy env-var path). */
  skills?: string[];

  /**
   * Durable per-tenant skill name allowlist.
   * When present, only skills in this list are linked at startup.
   * Takes precedence over spec.skills for auditable skill governance.
   */
  skillAllowlist?: string[];

  /**
   * Per-tenant MCP server allow/deny policy applied at invocation level.
   * Complements the AccessPolicy mcpServers field with tenant-specific overrides.
   */
  mcpPolicy?: {
    /** MCP server names explicitly allowed for this tenant. */
    allow?: string[];
    /** MCP server names explicitly denied for this tenant. */
    deny?: string[];
  };

  /**
   * Channel configuration for tenant communication integrations.
   * Credentials reference Kubernetes Secrets by name rather than storing values inline.
   */
  channels?: {
    /** Slack workspace and channel configuration. */
    slack?: {
      /** Slack workspace/team ID. */
      workspaceId?: string;
      /** Slack channel ID where the tenant bot posts status. */
      channelId?: string;
      /** Name of the Kubernetes Secret containing the Slack bot token. */
      botTokenSecretName?: string;
    };
    /** WhatsApp Business API channel configuration. */
    whatsapp?: {
      /** WhatsApp phone number in E.164 format (e.g. "+15551234567"). */
      phoneNumber?: string;
      /** Name of the Kubernetes Secret containing WhatsApp API credentials. */
      credentialsSecretName?: string;
    };
  };

  /** Arbitrary OpenClaw config overrides merged into the base config. */
  configOverrides?: Record<string, unknown>;

  /** Name of an AccessPolicy CR to bind to this tenant. */
  policyRef?: string;

  /** When true, the tenant deployment is scaled to zero. */
  suspended?: boolean;
}
