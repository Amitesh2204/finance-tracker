# Finance Tracker - Security Hardening Migration

## 1. Objective

This document tracks the security hardening changes being migrated
from the tested `finance-tracker-test` project into the production
`finance-tracker` repository.

The primary objective is to remove hardcoded CouchDB credentials from
the frontend while preserving the existing application functionality.

---

## 2. Migration Branch

Migration branch:

`security-hardening-prod`

Production rollback branch:

`prod-before-security-hardening`

Production baseline commit:

`2944864f125a37aeab7231853e7cfbc9c13cabaa`

---

## 3. Existing Production Architecture

Current application flow:

Browser
  |
  v
PouchDB
  |
  v
CouchDB
  |
  v
FastAPI / PostgreSQL synchronization

The previous frontend configuration contained CouchDB credentials.
This creates a security risk because frontend JavaScript deployed
through GitHub Pages can be inspected by users.

---

## 4. Target Security Architecture

The frontend must not contain a CouchDB username or password.

Frontend configuration will contain only non-secret configuration such as:

- CouchDB host
- CouchDB database name
- API URL
- application environment

CouchDB credentials required for browser synchronization will be
provided at runtime and kept only for the current browser session.

Backend CouchDB credentials will remain server-side in `.env`.

Real credentials must never be committed to Git.

---

## 5. Changes Tested in finance-tracker-test

The following changes were implemented and tested in the test project:

- Removed CouchDB credentials from frontend configuration.
- Added runtime CouchDB credential configuration.
- Store runtime sync credentials in `sessionStorage`.
- Do not store CouchDB credentials in `localStorage`.
- Added CouchDB sync status handling.
- Added test environment configuration.
- Added local-only finance user handling.
- Improved password hashing for application users.
- Updated FastAPI CouchDB authentication.
- Added environment-based backend configuration.
- Added validation/security headers.
- Added PostgreSQL test configuration.
- Added `.env.example`.
- Updated `.gitignore`.
- Updated service worker/cache handling.

---

## 6. Test Validation

The test environment was validated before starting production migration.

### Frontend

- GitHub Pages deployment: PASS
- Login: PASS
- New user registration: PASS
- Add transaction: PASS
- PouchDB operation: PASS
- CouchDB synchronization: PASS
- Incorrect CouchDB password handling: PASS
- Correct CouchDB password synchronization: PASS

### Credential Storage

- CouchDB credentials in `config.js`: NOT PRESENT
- CouchDB credentials in `localStorage`: NOT PRESENT
- CouchDB credentials during active session: `sessionStorage`
- Production credentials committed to Git: MUST NOT BE PRESENT

### Backend

- FastAPI startup: PASS
- FastAPI Swagger `/docs`: PASS
- FastAPI to CouchDB authentication: PASS
- Test CouchDB database access: PASS

---

## 7. Production Migration Strategy

Production changes will be migrated incrementally.

Order:

1. Protect current production state.
2. Create migration branch.
3. Add migration documentation.
4. Compare test changes with production.
5. Migrate frontend configuration/security changes.
6. Migrate frontend synchronization changes.
7. Migrate backend configuration/security changes.
8. Run local validation.
9. Commit changes in logical groups.
10. Deploy backend.
11. Verify backend connectivity.
12. Deploy frontend.
13. Verify login.
14. Verify transaction operations.
15. Verify CouchDB synchronization.
16. Monitor production.
17. Merge migration branch after successful validation.

---

## 8. Production-Specific Values

Test values must not be copied directly to production.

The following must remain production-specific:

- Production GitHub Pages URL
- Production CouchDB database
- Production API URL
- Production Cloudflare URL
- Production PostgreSQL database
- Production service-worker configuration
- Production application settings

---

## 9. Secrets Management

Real secrets must remain outside Git.

Production secrets include:

- CouchDB username
- CouchDB password
- PostgreSQL password
- API secrets
- Any other authentication credentials

`.env` must remain ignored by Git.

Only `.env.example` containing placeholder values may be committed.

---

## 10. Rollback Strategy

If production validation fails:

1. Stop further deployment.
2. Revert frontend deployment if required.
3. Restore previous backend version if required.
4. Keep production database data untouched unless a verified
   database/data problem exists.
5. Use `prod-before-security-hardening` as the rollback branch.
6. Investigate and correct the issue in the migration branch.

---

## 11. Migration Status

Current status:

- [x] Production rollback branch created
- [x] Migration branch created
- [x] Migration branch matches production baseline
- [x] Test environment security changes validated
- [x] Documentation created
- [ ] Frontend changes migrated
- [ ] Backend changes migrated
- [ ] Local validation
- [ ] Production deployment
- [ ] Production validation
- [ ] Migration completed

---

## 12. Important Rule

Do not commit real passwords, tokens, API keys, CouchDB credentials,
PostgreSQL credentials, or other secrets to the repository.
