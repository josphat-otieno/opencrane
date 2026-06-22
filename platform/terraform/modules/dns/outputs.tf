output "name_servers"
{
  description = "DNS zone name servers (delegate your domain to these)"
  value       = google_dns_managed_zone.opencrane.name_servers
}

output "dns_zone_name"
{
  description = "Cloud DNS zone resource name"
  value       = google_dns_managed_zone.opencrane.name
}

output "dns_writer_service_account_email"
{
  description = "Email of the shared DNS-writer GSA. Annotate the external-dns + cert-manager KSAs with `iam.gke.io/gcp-service-account=<this>` to complete the Workload-Identity binding."
  value       = google_service_account.dns_writer.email
}
