# -----------------------------------------------------------------------------
# GKE module
#
# GKE Autopilot cluster — Google manages nodes, bin-packing, and scaling.
# Nodes scale to zero when no pods are scheduled. You pay per pod resource.
#
# By default (vpc_id/subnet_id empty) the cluster runs on the project's default
# VPC with Google-managed IP allocation — no custom networking required. Supply
# vpc_id/subnet_id (and enable_private_nodes) for a dedicated VPC with private
# nodes.
# -----------------------------------------------------------------------------

locals
{
  use_custom_vpc = var.vpc_id != "" && var.subnet_id != ""
}

resource "google_container_cluster" "cluster"
{
  provider = google-beta

  name     = var.cluster_name
  project  = var.project_id
  location = var.region

  # Omitted (null) when on the default VPC so GKE picks the default network.
  network    = local.use_custom_vpc ? var.vpc_id : null
  subnetwork = local.use_custom_vpc ? var.subnet_id : null

  # Autopilot mode — no node pools to manage
  enable_autopilot = true

  # Private cluster configuration — only when a custom VPC provides Cloud NAT.
  dynamic "private_cluster_config"
  {
    for_each = var.enable_private_nodes ? [1] : []
    content
    {
      enable_private_nodes    = true
      enable_private_endpoint = false
      master_ipv4_cidr_block  = "172.16.0.0/28"
    }
  }

  # Master authorized networks -- restrict API access
  master_authorized_networks_config
  {
    cidr_blocks
    {
      cidr_block   = "0.0.0.0/0"
      display_name = "All (restrict in production)"
    }
  }

  # IP allocation policy. With a custom VPC use the named secondary ranges; on
  # the default VPC let GKE auto-allocate (empty block).
  dynamic "ip_allocation_policy"
  {
    for_each = local.use_custom_vpc ? [1] : []
    content
    {
      cluster_secondary_range_name  = "pods"
      services_secondary_range_name = "services"
    }
  }

  dynamic "ip_allocation_policy"
  {
    for_each = local.use_custom_vpc ? [] : [1]
    content {}
  }

  # Release channel for automatic upgrades
  release_channel
  {
    channel = "REGULAR"
  }

  deletion_protection = false
}
