# -----------------------------------------------------------------------------
# OpenCrane — Cloud-Agnostic Core
#
# Applies to ANY Kubernetes cluster: on-prem, GKE, AKS, EKS, k3d.
# Does NOT provision cloud infrastructure. Assumes a kubeconfig is already
# pointed at the target cluster.
#
# Usage:
#   cd platform/terraform/core
#   terraform init
#   terraform apply
#
# For cloud installs, run cloud/<provider>/main.tf FIRST to provision the
# cluster and managed services, then apply this module on the resulting cluster.
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5.0"

  required_providers
  {
    helm =
    {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }

    kubernetes =
    {
      source  = "hashicorp/kubernetes"
      version = "~> 2.25"
    }
  }
}

variable "image_tag"
{
  description = "Docker image tag for OpenCrane components"
  type        = string
  default     = "latest"
}

variable "namespace"
{
  description = "Kubernetes namespace to deploy OpenCrane into"
  type        = string
  default     = "opencrane"
}

variable "helm_values_file"
{
  description = "Path to a Helm values override file (e.g. values/gcp.yaml for GCP installs)"
  type        = string
  default     = ""
}

resource "kubernetes_namespace" "opencrane"
{
  metadata
  {
    name = var.namespace
  }
}

resource "helm_release" "opencrane"
{
  name       = "opencrane"
  chart      = "${path.module}/../../helm"
  namespace  = kubernetes_namespace.opencrane.metadata[0].name
  wait       = true
  timeout    = 600

  set
  {
    name  = "operator.image.tag"
    value = var.image_tag
  }

  set
  {
    name  = "controlPlane.image.tag"
    value = var.image_tag
  }

  dynamic "values"
  {
    for_each = var.helm_values_file != "" ? [var.helm_values_file] : []
    content
    {
      content = file(values.value)
    }
  }
}
