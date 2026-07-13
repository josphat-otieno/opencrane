# -----------------------------------------------------------------------------
# Root outputs
# -----------------------------------------------------------------------------

output "cluster_name"
{
  description = "GKE cluster name"
  value       = module.gke.cluster_name
}

output "cluster_endpoint"
{
  description = "GKE cluster endpoint"
  value       = module.gke.cluster_endpoint
  sensitive   = true
}

output "registry_url"
{
  description = "Registry URL for OpenCrane images (Artifact Registry when enabled, else the external registry)"
  value       = local.registry_url
}

output "ingress_ip"
{
  description = "External IP for the ingress controller (null until the app is deployed)"
  value       = one(module.app_deploy[*].ingress_ip)
}

output "control_plane_url"
{
  description = "URL for the OpenCrane control plane (null until the app is deployed)"
  value       = one(module.app_deploy[*].control_plane_url)
}

output "dns_name_servers"
{
  description = "Cloud DNS name servers (empty unless enable_cloud_dns is on). Delegate your domain to these."
  value       = length(module.dns) > 0 ? module.dns[0].name_servers : []
}

output "dns_setup_instructions"
{
  description = "Manual DNS guidance when Cloud DNS is disabled."
  value       = length(module.dns) > 0 ? "Cloud DNS zone + shared DNS-writer GSA managed by Terraform — delegate ${var.domain} to the dns_name_servers output at your registrar (NS delegation), and pass dns_writer_service_account_email to k8s-deploy.sh --dns-writer-gsa so cert-manager DNS-01 can issue. external-dns reconciles per-org records at runtime. The install-time platform A-records (apex, *.<domain>, opencrane-ui host) are written only once the ingress IP is known (Terraform app-deploy, or re-apply after the LB IP is assigned); until then add them at your registrar pointing at the ingress IP (kubectl get svc -n ingress-nginx)." : "Point an A record for your domain and a wildcard *.<domain> at the ingress IP (run: kubectl get ingress -A) at your DNS provider."
}

output "dns_writer_service_account_email"
{
  description = "Shared DNS-writer GSA (roles/dns.admin) impersonated by external-dns + cert-manager DNS-01 (empty unless enable_cloud_dns is on)."
  value       = length(module.dns) > 0 ? module.dns[0].dns_writer_service_account_email : ""
}

output "database_url"
{
  description = "PostgreSQL connection string (null until the app is deployed)"
  value       = try("postgresql://opencrane:${module.app_deploy[0].database_password}@${module.app_deploy[0].database_host}:5432/opencrane", null)
  sensitive   = true
}

output "kubeconfig_command"
{
  description = "Command to configure kubectl"
  value       = "gcloud container clusters get-credentials ${module.gke.cluster_name} --region ${var.region} --project ${var.project_id}"
}
