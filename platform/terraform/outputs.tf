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
  description = "External IP for the ingress controller"
  value       = module.app_deploy.ingress_ip
}

output "control_plane_url"
{
  description = "URL for the OpenCrane control-plane UI"
  value       = module.app_deploy.control_plane_url
}

output "dns_name_servers"
{
  description = "Cloud DNS name servers (empty unless enable_cloud_dns=true). Delegate your domain to these."
  value       = var.enable_cloud_dns ? module.dns[0].name_servers : []
}

output "dns_setup_instructions"
{
  description = "Manual DNS guidance when Cloud DNS is disabled."
  value = var.enable_cloud_dns ? "Cloud DNS managed by Terraform — delegate ${var.domain} to the dns_name_servers output." : "Create an A record for ${var.domain} and a wildcard *.${var.domain} pointing at the ingress_ip output at your DNS provider."
}

output "database_url"
{
  description = "PostgreSQL connection string"
  value       = "postgresql://opencrane:${module.app_deploy.database_password}@${module.app_deploy.database_host}:5432/opencrane"
  sensitive   = true
}

output "kubeconfig_command"
{
  description = "Command to configure kubectl"
  value       = "gcloud container clusters get-credentials ${module.gke.cluster_name} --region ${var.region} --project ${var.project_id}"
}
