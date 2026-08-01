# Project Overview

## Purpose
Finance Tracker is a personal finance dashboard that combines a static frontend with a FastAPI backend and CouchDB storage. The application is designed to be simple to deploy while supporting an offline-first experience for expense and investment tracking.

## Repository layout
- backend/: Python API server, database access layer, models, routes, services, and tests.
- frontend/: Browser-based UI, shared JavaScript modules, styles, and static assets.
- docs/: Documentation for contributors and maintainers.
- caddy/: Reverse proxy configuration for deployment.
- deploy_frontend.ps1: Helper script for publishing the frontend to GitHub Pages.
- index.html and sw.js: Root entry point and service worker for the web app.

## Runtime responsibilities
- The frontend is served from the repository root through index.html and the frontend/ directory.
- The backend API is started from backend/main.py and exposes endpoints for entries and health checks.
- CouchDB is used as the persistence layer through the backend database helpers.
- The Caddy configuration is used for deployment and HTTPS termination when running behind a reverse proxy.

## Maintenance notes
- Keep documentation inside docs/ up to date whenever folders or entry points change.
- Place new backend modules under backend/ and keep imports anchored to the package layout.
- Keep frontend assets under frontend/ and reference them from the root entry page using relative paths.
- Preserve the root-level deployment files such as deploy_frontend.ps1, index.html, and sw.js so the hosting workflow remains intact.
