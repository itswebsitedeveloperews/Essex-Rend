---
name: Astro Cloudflare runtime
description: Security and runtime lessons for maintaining Astro SSR on Cloudflare in Replit.
---

Use Astro 7.2.8 or newer because earlier releases were blocked by the package firewall for a critical AVIF image-optimization vulnerability.

**Why:** Astro versions below 7.2.8 were rejected during installation, and the published security advisory identifies 7.2.8 as the patched release.

**How to apply:** Do not downgrade below the patched version. When upgrading, check current Astro security advisories and keep the Cloudflare adapter compatible.

For SSR configuration, read both public and secret Turnstile values from Cloudflare runtime bindings rather than mixing build-time public values with runtime secrets.

**Why:** Mixing sources can render a form without a widget while the endpoint requires a token, blocking every legitimate submission.

**How to apply:** Any value that must stay synchronized with a Worker secret should come from the same runtime environment during SSR.

Astro CLI auto-backgrounds servers in detected agent environments, while Replit workflows require a foreground process.

**Why:** An auto-backgrounded process makes the workflow appear finished or failed even when the CLI briefly reports a server URL.

**How to apply:** Explicitly disable Astro's agent background mode in workflow-facing dev or preview commands.

Cloudflare's Astro preview adapter takes allowed hosts from Astro's top-level server configuration, not the nested Vite preview configuration.

**Why:** The adapter creates a separate Vite preview server with configFile disabled; nested Vite settings did not prevent Replit hostname rejection even though localhost returned 200.

**How to apply:** Configure Astro server.allowedHosts and verify requests using the actual browser Host header, not only localhost.