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
  value = length(module.dns) > 0 ? "Cloud DNS managed by Terraform — delegate ${var.domain} to the dns_name_servers output." : "Point an A record for your domain and a wildcard *.<domain> at the ingress IP (run: kubectl get ingress -A) at your DNS provider."
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
