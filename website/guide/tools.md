# Connect tools

Assistants reach external systems — Slack, Jira, Salesforce, and more — through
**MCP servers**. You register a tool once, decide who can use it, and OpenCrane
handles the credentials.

## Register a tool

```bash
oc mcp list
oc mcp create -f slack-mcp.yaml
oc mcp get <name>
oc mcp update <name> -f slack-mcp.yaml
oc mcp delete <name>
```

## Who can use it

Grant access per person, team, or project with an
[access policy](/guide/permissions). An assistant can only call the tools it's been
granted.

## Credentials stay safe

Downstream credentials (a tool's API key or a user's OAuth token) are brokered
**server-side** by the gateway and **never reach the assistant's pod** or the
browser. The assistant authenticates with a short-lived, audience-bound token.

## Learn more

Catalog sync, policy enforcement, and credential brokering are covered in
[MCP gateway (Obot)](/integrators/mcp-gateway).
