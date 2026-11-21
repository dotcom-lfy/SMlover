# SMS-IYTS Cloudflare Worker internal testing

This revision serves an internal SMS testing form from Cloudflare Workers
Static Assets and sends validated requests through a fixed,
administrator-configured SMS provider. Deployment diagnostics remain available
as backend API routes and are not shown on the testing homepage.

The legacy third-party endpoint list and general-purpose CORS proxy are not
included.

## Project layout

```text
index.js                  Worker API and provider adapter
public/index.html         internal SMS testing form
public/_headers           browser security and cache headers
wrangler.toml             deployment, assets, rate limit and observability
.github/workflows/        optional GitHub Actions deployment
```

Only `public/` is uploaded as static content.

## API routes

- `POST /api/send` validates the phone number, message and recipient consent,
  applies a per-recipient one-minute rate limit, and calls the configured
  provider.
- `GET /api/health` reports Worker and provider-configuration status.
- `GET /api/outbound-check` performs the administrator outbound-network check.

## SMS provider contract

The Worker makes one HTTPS `POST` request to `SMS_PROVIDER_URL`:

```json
{
  "to": "+8613812345678",
  "message": "Message text",
  "senderId": "SMS-IYTS"
}
```

It sends `Authorization: Bearer <SMS_API_TOKEN>`. A provider response in the
`200`–`299` range is treated as accepted.

Configure production values without committing them:

```bash
wrangler secret put SMS_PROVIDER_URL
wrangler secret put SMS_API_TOKEN
wrangler secret put SMS_SENDER_ID
```

For local development, put the same names in an ignored `.dev.vars` file.

## Local verification

```bash
wrangler dev --local --port 8787
```

Verify:

- `http://localhost:8787/` shows the internal SMS testing form.
- `GET /api/health` returns HTTP 200.
- `POST /api/send` rejects invalid input.
- Without provider secrets, valid input returns
  `503 provider_not_configured` and does not contact an external service.

## Deploy

```bash
wrangler deploy
```

For GitHub Actions, configure:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Workers Builds should use the `main` branch, repository root, no build command,
and `npx wrangler deploy` as its deploy command.

## Required security action

The old deployment publicly exposed a hard-coded credential in
`test_anthropic.py`. Removing the file does not invalidate the exposed value.
Rotate or revoke that credential in the issuing service.

See `SECURITY.md` for the repository rules used by this revision.
