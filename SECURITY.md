# Security notes

- Static assets are restricted to `public/`; the repository root must not be deployed as assets.
- Local test scripts, API keys, cookies and `.dev.vars` files must not be committed or uploaded.
- The previously bundled test credential was publicly reachable and must be rotated or revoked outside this repository.
- `/api/outbound-check` is intentionally fixed to `https://example.com/` and is not a general-purpose proxy.
- Generated `.wrangler/` files are ignored and must not be committed.

