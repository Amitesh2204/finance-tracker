# Savings Tracker Database Schema

This project uses IndexedDB for browser-based storage. No server or binary installation is required.

## Store: `entries`
- `id` (auto-increment)
- `type` (string): mutual_fund, lic, bank_deposit, sukanya_yojana, expense
- `amount` (number)
- `date` (YYYY-MM-DD)

All data is stored locally in the browser.
