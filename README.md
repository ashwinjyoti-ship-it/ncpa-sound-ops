# NCPA Sound Ops

Unified internal operations application for NCPA Sound department.

## Features

### 📅 Schedule Module
- Calendar view with month navigation
- Event management (CRUD)
- Search and filtering
- Word document upload (planned)
- WhatsApp export (planned)

### 👥 Crew Assignment Module
- 5-step workflow:
  1. Mark Day-offs
  2. Import Events from Schedule
  3. Set Crew Requirements
  4. Run Auto-Assignment Engine
  5. Review & Push to Calendar
- 14 crew members across 4 levels (Senior, Mid, Junior, Hired)
- Capability matrix for venues and verticals
- Workload balancing

### 💰 Quote Builder Module
- Equipment search with autocomplete
- Dynamic row management
- GST calculation (18%)
- Copy as HTML/rich text
- Equipment management CRUD

## Tech Stack

- **Backend**: Hono (Cloudflare Workers)
- **Frontend**: Vanilla TypeScript/TSX
- **Database**: Cloudflare D1
- **Styling**: Tailwind CSS (Teenage Engineering Dark Theme)
- **Deployment**: Cloudflare Pages

## Development

```bash
# Install dependencies
npm install

# Run local development
npm run dev

# Build
npm run build

# Deploy
npm run deploy:prod
```

## Database

Using existing D1 database: `ncpa-sound-crew-db`

### Run migrations locally
```bash
npm run db:migrate:local
npm run db:seed
```

### Run migrations in production
```bash
npm run db:migrate:prod
```

## Authentication

- JWT-based authentication
- 8-hour session cookies
- Credentials stored as Cloudflare Worker secrets:
  - `APP_USERNAME`
  - `APP_PASSWORD`

## Deployment

Automatically deploys to Cloudflare Pages on push to `main` branch.

**Live URL**: https://ncpa-sound-ops.pages.dev
