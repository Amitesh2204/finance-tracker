# Project Overview

## Project Summary

**Purpose:** Finance tracking application for managing expenses, budgets, and investments.

**Technologies:** 
- Backend: Python (Flask/FastAPI), CouchDB
- Frontend: HTML5, CSS3, JavaScript (Vanilla)
- Deployment: PowerShell scripts

**Current Status:** Active development

---

## Folder Structure

### Backend (`/backend`)
- `main.py` – Application entry point
- `database/` – Database models and configuration (CouchDB)
- `routes/` – API endpoints
- `services/` – Business logic and utilities
- `tests/` – Unit tests

### Frontend (`/frontend`)
- `app.js` – Main application controller
- `config.js` – Configuration and constants
- `db.js` – Database/API client
- `charts.js` – Chart rendering utilities
- `pages/` – Page-specific logic and styling
  - `budget/` – Budget tracking
  - `expense/` – Expense tracking (Monthly, Trip variants)
  - `investments/` – Investment tracking (Mutual Fund, PPF, LIC, Sukanya variants)
  - `reports/` – Report generation
- `assets/` – Images and media files
- `components/` – Reusable UI components

### Docs (`/docs`)
- Project documentation and guides

### Root Files
- `index.html` – Application shell
- `manifest.json` – PWA configuration
- `sw.js` – Service Worker (offline support)
- `style.css` – Global styles
- `deploy_frontend.ps1` – Deployment script

---

## File Index

| File | Description | Link |
|------|-------------|------|
| backend/main.py | Backend server entry point | [OneDrive]() |
| backend/database/models.py | CouchDB data models | [OneDrive]() |
| frontend/app.js | Frontend application controller | [OneDrive]() |
| frontend/config.js | Configuration settings | [OneDrive]() |
| frontend/index.html | Main HTML shell | [OneDrive]() |
| frontend/pages/expense/expense.js | Expense tracking logic | [OneDrive]() |
| frontend/pages/investments/investments.js | Investments tracking logic | [OneDrive]() |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| YYYY-MM-DD | Initial project setup | [Your Name] |
| YYYY-MM-DD | Implemented expense page layout | [Your Name] |
| YYYY-MM-DD | Added investment tracking | [Your Name] |

---

## Next Steps

### Immediate (Sprint 1)
- [ ] Document API endpoints
- [ ] Add unit tests for critical paths
- [ ] Optimize database queries

### Short Term (Sprint 2-3)
- [ ] Implement user authentication
- [ ] Add data export functionality
- [ ] Mobile app improvements

### Future Enhancements
- [ ] Real-time analytics dashboard
- [ ] Budget recommendations (AI-powered)
- [ ] Multi-user collaboration features
