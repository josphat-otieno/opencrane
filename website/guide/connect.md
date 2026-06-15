# Connect to OpenClaw

Once you've [created a tenant](/guide/first-tenant), the person can start using their
assistant. They **sign in once** and connect to OpenClaw in the browser.

## For the user

1. Go to your assistant's URL — `https://<your-name>.<your-org-domain>`
   (for example `https://jente.opencrane.example.com`).
2. Sign in with your organization account (OIDC single sign-on).
3. Your assistant opens — chat, retrieval, and canvas are ready.

That's it. There's no separate password or token to manage: OpenCrane pairs your
browser to your assistant automatically and securely.

## What happens behind the scenes

You log in **once** to the control plane. When you open your assistant, the control
plane hands your browser a short-lived **pairing link** to your own OpenClaw pod —
it never proxies your conversation and never stores a long-lived token in your
browser. Your assistant talks to tools and skills server-side; those credentials
never reach the browser.

This means an administrator can **instantly cut off** any assistant (a per-user
kill-switch) without affecting anyone else.

For the full identity and connection design, see
[Identity & connection auth](/security/identity) and the
[connection security model](/security/connection-security).

## Give an assistant access to more

A fresh assistant starts locked down. To let it use organizational knowledge,
skills, and tools, grant access:

- [Control access](/guide/permissions)
- [Add skills](/guide/skills)
- [Connect tools](/guide/tools)
- [Organizational knowledge](/guide/knowledge)
