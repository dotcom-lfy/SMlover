# SMS-IYTS Cloudflare Worker deployment diagnostics

This revision provides a reproducible Cloudflare Workers deployment and a small
diagnostic page. It verifies the Worker runtime, static asset binding and a
fixed outbound request to `https://example.com/`.

It does not expose a general-purpose proxy and does not execute the legacy list
of third-party SMS endpoints.

## Why the previous one-click deployment failed

The old repository mixed three incompatible deployment paths:

- `wrangler.toml` described a Worker with `index.js` as its entry point.
- `wrangler.json` described only static assets and omitted the Worker entry.
- GitHub Actions and `deploy.sh` deployed the repository as Cloudflare Pages.

The repository root was also used as the static asset directory. As a result,
the customer `workers.dev` deployment served `index.html`, source files,
configuration files and a local credential-bearing test script as public
assets, while the Worker request handler was not active.

## Project layout

```text
index.js                  Worker entry point
public/index.html         deployment diagnostic UI
public/_headers           security and cache headers
wrangler.toml             single authoritative deployment config
.github/workflows/        optional GitHub Actions deployment
```

Only `public/` is uploaded as static content.

## Local verification

```bash
npm install -g wrangler
wrangler login
wrangler dev --local --port 8787
```

Open these paths:

- `http://localhost:8787/`
- `http://localhost:8787/api/health`
- `http://localhost:8787/api/outbound-check`

The two API endpoints must return HTTP 200 with `"ok": true`.

## Deploy

```bash
wrangler deploy
```

For GitHub Actions, configure these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Push to `main`, or run the `Deploy Cloudflare Worker` workflow manually.

## Cloudflare Git integration

Use Workers rather than Pages and configure:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | leave empty |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

## Required security action

The old deployment publicly exposed a hard-coded credential in
`test_anthropic.py`. Removing the file from the repository does not invalidate
the exposed value. Rotate or revoke that credential in the service that issued
it, then remove old Cloudflare deployments or versions that still contain it.

See `SECURITY.md` for the repository rules used by this revision.
