# Essex Rend

A lightweight Astro rebuild of the Essex Rend marketing website. It has no WordPress, Elementor, PHP, MySQL, or plugin dependencies.

## Local development

```bash
npm install
npm run dev
```

The development server runs on port `5000`.

## Production build

```bash
npm run build
```

## Environment variables

Copy `.env.example` to `.env` for local development. Configure the same values as encrypted Cloudflare secrets or environment variables for production.

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Server-side Resend API key |
| `CONTACT_TO_EMAIL` | Destination for website enquiries |
| `CONTACT_FROM_EMAIL` | Verified Resend sender address |
| `TURNSTILE_SECRET_KEY` | Optional Cloudflare Turnstile secret |
| `PUBLIC_TURNSTILE_SITE_KEY` | Optional public Turnstile site key |

If email variables are missing, the form validates normally and then asks the visitor to call instead of silently losing an enquiry. Turnstile is enabled only when its public and secret keys are configured.

## Contact form

`POST /api/contact` performs server-side field validation, input length limits, control-character removal, honeypot checking, basic per-IP throttling, optional Turnstile verification, and server-side delivery through Resend. Keys are never sent to the browser.

For stronger distributed rate limiting across Cloudflare isolates, add a Cloudflare Rate Limiting rule or bind a KV/Durable Object implementation.

## Cloudflare deployment

### Direct deployment

```bash
npm run deploy
```

Authenticate Wrangler in the deployment environment and configure all required secrets before deploying.

### GitHub to Cloudflare

1. Push this repository to GitHub.
2. In Cloudflare Workers & Pages, create a project connected to the production branch.
3. Set the build command to `npm run build`.
4. Set the deploy command to `npx wrangler deploy`.
5. Add the environment variables listed above.
6. Attach `essexrend.co.uk` as the production custom domain.

The canonical URL, sitemap, and robots file are already set to `https://essexrend.co.uk/`.