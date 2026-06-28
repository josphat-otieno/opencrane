variable "project_id"
{
  description = "GCP project ID"
  type        = string
}

variable "zone_name"
{
  description = "Cloud DNS zone name (resource name, not the domain)"
  type        = string
  default     = "opencrane"
}

variable "domain"
{
  description = "Platform org-wildcard base domain. Orgs are <org>.<domain>, users <user>.<org>.<domain> (e.g. weownai.eu)."
  type        = string
}

variable "ingress_ip"
{
  description = "External IP of the ingress controller. Optional: when empty the install-time platform A-records (`*.<domain>`, apex, control-plane host) are SKIPPED while the zone + the shared DNS-writer identity are still created — so the zone-write GSA is provisioned in a cluster-only flow (before the app/IP exists) and cert-manager DNS-01 can issue. Set it (or re-apply once the ingress IP is known) to also write the platform records."
  type        = string
  default     = ""
}

variable "control_plane_host"
{
  description = "Fixed super-operator / control-plane host (distinct from the org wildcard). Empty → defaults to platform.<domain>."
  type        = string
  default     = ""
}

# Shared zone-write identity. Per-host/per-org records are written at RUNTIME by
# external-dns (from the operator's DNSEndpoint CRs), never by Terraform — so this module
# provisions the WRITE identity both external-dns and the cert-manager DNS-01 solver share,
# not the records themselves.
variable "dns_writer_account_id"
{
  description = "Account id (local part) for the shared DNS-writer Google service account that external-dns + cert-manager DNS-01 impersonate."
  type        = string
  default     = "opencrane-dns-writer"
}

variable "dns_writer_ksa_members"
{
  description = "Kubernetes service accounts (as `<namespace>/<name>`) granted Workload-Identity impersonation of the shared DNS-writer GSA — typically the external-dns and cert-manager controllers."
  type        = list(string)
  default     = ["external-dns/external-dns", "cert-manager/cert-manager"]
}
