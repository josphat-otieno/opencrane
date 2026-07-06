# Communication Connector Direction Report

## Why a Slack Connector Was Added

The Slack connector was implemented as an MVP harvesting path because:

- It provided a fast path to validate cursor-based ingestion mechanics.
- It supplied realistic, high-volume conversational content for retrieval validation.
- It allowed proving ingestion metrics (`lag`, `failure`) and deduplication behavior early.

## Why Slack Should Not Be Treated as the Sole Primary Connector

- Enterprise communication ecosystems are broader than Slack.
- Tenant requirements commonly include Microsoft and Google ecosystems.
- A single-provider design increases product and architecture lock-in.

## Communication/Knowledge Source Options

1. **Slack**
   - Strong event/message APIs, mature ecosystem.
2. **Microsoft 365 / Teams / SharePoint**
   - Critical for enterprise adoption; deep document + chat coverage.
3. **Google Workspace (Drive, Docs, Chat)**
   - Widely used for tenant documents and discussions.
4. **Confluence / Jira comments**
   - Key institutional knowledge and decision trails.
5. **Email systems (Exchange/Gmail)**
   - High-value operational and approval context (with strict governance controls).

## Recommendation

- Keep Slack as a validated MVP connector implementation.
- Move to an **adapter-driven connector portfolio** where Slack is one adapter, not the default architecture anchor.
- Prioritize Office 365/SharePoint and Google Workspace in the next connector evaluation cycle due to broad enterprise demand.
