# NCPA Sound Ops

Unified internal operations application for NCPA Sound department.

## Features

### 📅 Schedule Module
- Calendar view with month navigation
- Event management (CRUD)
- Search and filtering
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

### 📄 Word Document Parsing (AI-Powered)
- Upload Word documents (.docx) containing equipment rate charts
- **AI Parsing**: Uses Anthropic Claude API to intelligently extract equipment names and rates
- **Basic Parsing**: Fallback regex-based parsing for simple formats
- Bulk import parsed items with duplicate detection
- Requires Anthropic API key (configured in Settings page)
- Flow:
  1. Go to Manage Equipment page
  2. Upload your rate chart Word document
  3. Enable "Use AI Parsing" for best results
  4. Review extracted items
  5. Import selected items to database

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

- JWT-based authentication with 8-hour session cookies
- **Settings Page** (`/settings`): Manage credentials directly in the app
  - Username and password management
  - Anthropic API key configuration (for Word document AI parsing)
  - Passwords are securely hashed with PBKDF2
  - API keys are encrypted with AES-GCM
  - Changes take effect immediately (no redeploy needed)
  
### First Login After Migration
On first login, use the existing Cloudflare secrets credentials (`ncpalivesound`/`hangover123`). After logging in, visit Settings to configure your credentials.

### Fallback Credentials
If the app_settings table doesn't exist, these Cloudflare Worker secrets are used:
- `APP_USERNAME`
- `APP_PASSWORD`

## Deployment

Automatically deploys to Cloudflare Pages on push to `main` branch.

**Live URL**: https://ncpa-sound-ops.pages.dev
