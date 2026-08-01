# 2026-07-04 Deploy and domain update

Files changed:
- `.gitignore` — updated to keep only `frontend/` for GitHub Pages deployments
- `frontend/app.js` — updated PouchDB sync URL to `personaltracker.duckdns.org`
- `caddy/Caddyfile` — updated DuckDNS domain to `personaltracker.duckdns.org`
- `deploy_frontend.ps1` — new script to push `frontend/` to `gh-pages`
- `README.md` — updated deployment, domain, and verification instructions

How the change was made:
- Edited and added scaffold files to align domain naming, streamline GitHub Pages deployment, and provide scripts and docs for deployment.

Why the change was necessary:
- The user requested domain rename to `personaltracker.duckdns.org`, a `.gitignore` that ensures only `frontend/` is included for Pages, and a workflow to push frontend to GitHub Pages.

Impact:
- Frontend is ready to be deployed to GitHub Pages separately from backend and infrastructure.
- PouchDB will sync to the updated DuckDNS domain when Caddy and CouchDB are running.
