variable "project_id"
{
  description = "GCP project ID"
  type        = string
}

variable "region"
{
  description = "GCP region for all resources"
  type        = string
  default     = "europe-west1"
}

variable "environment"
{
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "vpc_name"
{
  description = "Name for the VPC network"
  type        = string
  default     = "opencrane-vpc"
}

variable "cluster_name"
{
  description = "Name for the GKE cluster"
  type        = string
  default     = "opencrane-cluster"
}

variable "domain"
{
  description = "Base domain for tenant subdomains (e.g. opencrane.example.com)"
  type        = string
}

variable "image_tag"
{
  description = "Docker image tag for OpenCrane components"
  type        = string
  default     = "latest"
}
