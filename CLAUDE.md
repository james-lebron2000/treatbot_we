# CLAUDE.md — AI Assistant Guide for Treatbot

This file provides context for AI assistants working in this repository.

---

## Project Overview

**Treatbot** is a full-stack medical platform that helps cancer patients find and apply to matching clinical trials. It combines:

- AI-powered OCR to extract structured data from uploaded medical records
- A scoring-based matching engine to rank trials by patient eligibility
- A WeChat Mini Program + Vue3 H5 frontend
- A Node.js/Express REST API backend

---

## Repository Structure

```
treatbot_we/
├── app.js / app.json / app.wxss   # WeChat Mini Program entry
├── pages/                          # Mini Program pages (index, upload, records, matches, profile, search, guide)
├── components/                     # Reusable WXML components (card, loading, empty)
├── utils/                          # Mini Program utilities (api, auth, cache, match-explainer, schema, etc.)
├── styles/                         # Global WXSS styles
├── images/                         # Static assets
├── server/                         # Node.js backend
│   ├── app.js                      # Express app entry
│   ├── controllers/                # Request handlers (auth, user, medical, match, application, admin, health)
│   ├── models/                     # Sequelize ORM models (User, Trial, MedicalRecord, TrialApplication)
│   ├── routes/                     # Express route definitions
│   ├── services/                   # Business logic (ocr, oss, matchEngine, queue)
│   ├── middleware/                  # Express middleware (auth, adminAuth, errorHandler, idempotency, rateLimit)
│   ├── config/                     # DB config (Sequelize)
│   ├── utils/                      # Logging (Winston), text utils, response formatter
│   ├── tests/                      # Jest test suite
│   ├── scripts/                    # DB migration, seeding, deployment scripts
│   ├── Dockerfile                  # Alpine Node.js image
│   ├── docker-compose.yml          # Full stack (api + mysql + redis + nginx)
│   └── ecosystem.config.js         # PM2 cluster config
├── web/                            # Vue3 H5 frontend
│   └── src/
│       ├── pages/                  # Vue page components
│       ├── components/             # Vue components
│       ├── router/                 # Vue Router
│       ├── stores/                 # Pinia state
│       └── services/               # Axios-based API services
├── docs/                           # Supplementary documentation
├── nginx/                          # Nginx reverse proxy config
├── scripts/                        # Bash automation scripts
├── .github/workflows/              # GitHub Actions CI/CD
├── Makefile                        # 60+ convenience targets
└── .env.example                    # Environment variable template
```

---

## Technology Stack

### Backend (server/)
| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js 4.18 |
| ORM | Sequelize 6.35 (MySQL dialect) |
| Database | MySQL 8.0 |
| Cache / Queue | Redis 7 + Bull 4.12 |
| File Storage | Tencent Cloud COS |
| OCR | Kimi API (preferred), Tencent Cloud OCR (fallback), rule-based fallback |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Logging | Winston 3 with daily rotation |
| Security | Helmet, CORS, express-validator, express-rate-limit |
| Process mgmt | PM2 cluster mode |

### WeChat Mini Program (root)
- Native WXML/WXSS/JavaScript (no build step, WeChat DevTools compiles)
- wx.request for HTTP (no axios)
- Simple localStorage-based auth cache

### Web Frontend (web/)
- Vue 3 (Composition API) + TypeScript 5.8
- Vite 6 build
- Pinia 2.2 state management
- Vue Router 4.5
- Axios 1.8

---

## Development Workflows

### Backend

```bash
cd server
cp ../.env.example .env   # fill in values
npm install
npm run dev               # nodemon auto-reload
npm test                  # Jest + Supertest
npm run lint              # ESLint check
npm run lint:fix          # Auto-fix
```

### Web Frontend

```bash
cd web
npm install
npm run dev               # Vite dev server
npm run build             # Production build → dist/
```

### WeChat Mini Program
- Open the repo root in WeChat DevTools
- Set AppID in `project.config.json` (current: `wx1c8feab29d0cf3aa`)
- Requires a running backend and correct `utils/api.js` base URL

### Docker (recommended for full-stack testing)

```bash
cd server
docker-compose up -d      # Starts api + mysql + redis + nginx
# or via Makefile:
make up
make logs
make health
```

### Database

```bash
cd server
npm run db:migrate   # Run Sequelize migrations
npm run db:seed      # Seed sample trial data
```

---

## Environment Variables

Copy `.env.example` to `server/.env`. Key variables:

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 3000) |
| `DB_HOST/USER/PASSWORD/NAME` | MySQL connection |
| `REDIS_HOST/PORT/PASSWORD` | Redis connection |
| `JWT_SECRET` | JWT signing secret |
| `WEAPP_APPID / WEAPP_SECRET` | WeChat Mini Program credentials |
| `COS_*` | Tencent Cloud Object Storage |
| `OCR_PROVIDER` | `auto` \| `kimi` \| `tencent` \| `rule` |
| `KIMI_API_KEY` | Kimi (Moonshot) API key |
| `H5_LOGIN_ENABLED` | Enable H5 test login (dev only) |
| `ALLOWED_ORIGINS` | CORS whitelist |

---

## API Overview

All routes are under `/api`. Protected routes require `Authorization: Bearer <token>`.

| Area | Key Routes |
|---|---|
| Auth | `POST /auth/weapp-login`, `POST /auth/h5-login`, `POST /auth/refresh`, `POST /auth/bind-phone` |
| User | `GET /user/profile`, `GET /user/stats`, `PUT /user/profile` |
| Medical Records | `POST /medical/upload`, `GET /medical/parse-status`, `GET /medical/records`, `GET /medical/records/:id`, `DELETE /medical/records/:id` |
| Trial Matching | `GET /matches`, `POST /trials/matches/find`, `GET /trials`, `GET /trials/search`, `GET /trials/:id` |
| Applications | `POST /applications`, `GET /applications`, `PUT /applications/:id/cancel` |
| Admin | `GET /admin/dashboard`, `GET /admin/users`, `GET /admin/records`, `GET /admin/applications`, `GET /admin/exports/*` |
| Health | `GET /health`, `GET /health/detailed`, `GET /ready`, `GET /live` |

### Standard Response Format

Success:
```json
{ "code": 0, "message": "ok", "data": { ... } }
```
Error:
```json
{ "code": 400, "message": "error description", "data": null }
```

---

## Database Models

### MedicalRecord
```
id, user_id, type, file_key, file_hash, file_size
status: pending | running | completed | error
diagnosis, stage, gene_mutation, treatment
structured (JSON), remark
```

### TrialApplication
```
id, user_id, trial_id, record_ids (JSON array)
status: pending | contacted | enrolled | rejected | cancelled
idempotency_key (UNIQUE), contact_name, contact_phone, disease_snapshot
```

### User
```
id, nickname, phone, weapp_openid, openid
```

### Trial
```
id, name, phase, indication, inclusion/exclusion criteria, ...
```

---

## Matching Algorithm

Defined in `server/services/matchEngine.js`. Scoring tiers:

| Score Range | Meaning |
|---|---|
| 90–99 | Excellent match |
| 70–89 | Good match |
| 50–69 | Possible match |
| 40–49 | Weak match |
| 0–39 | Not matched |

Factors: disease match, cancer stage, gene mutations, ECOG performance, prior treatments, age, organ function.

Match explanations surfaced client-side via `utils/match-explainer.js`.

---

## Key Conventions

### Commit Style
Prefix commits with semantic types:
- `feat:` — new feature
- `fix:` — bug fix
- `ops:` — operational/deployment changes
- `chore:` — maintenance
- `ci:` — CI/CD changes
- `docs:` — documentation
- `build:` — build system changes

### Code Style
- 2-space indentation (enforced by ESLint + .editorconfig)
- Single quotes in JavaScript
- ES modules via CommonJS `require()` in backend
- Async/await throughout (no raw `.then()` chains)
- All API responses go through `utils/response.js` helper

### File Uploads
- Uploaded to Tencent Cloud COS; `file_key` stored in DB
- Local filesystem fallback available for dev (no COS credentials needed)
- Max file size: 10 MB (enforced via Multer in medical routes)

### OCR Flow
1. File uploaded → stored to COS → `MedicalRecord` created with `status: pending`
2. Bull queue job picks up task → calls Kimi or Tencent OCR → updates `structured` JSON
3. Client polls `GET /medical/parse-status?record_id=...` until `status: completed`

### Idempotency
Applications use an `idempotency_key` (UNIQUE constraint). The `idempotency` middleware rejects duplicate submissions with `409`.

### Auth Flow
- WeChat Mini Program: `wx.login()` code → `POST /auth/weapp-login` → JWT
- H5 dev testing: `POST /auth/h5-login` with `H5_LOGIN_ENABLED=true`
- Token expiry: `JWT_EXPIRES_IN=1800s`, refresh via `POST /auth/refresh`

### Admin Auth
Admin endpoints use a separate `adminAuth` middleware that checks a role flag on the user record.

---

## Testing

```bash
cd server
npm test                          # Run all tests with coverage
npm run test:watch                # Watch mode
```

Test files live in `server/tests/`. CI runs `jest --runInBand --forceExit` to prevent hanging.

Health endpoint smoke tests are runnable via `scripts/smoke.sh` after deployment.

---

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. **Test** — ESLint + Jest on Node 18
2. **Build** — Docker image pushed to Docker Hub
3. **Deploy** — SSH into server, `docker-compose pull && docker-compose up -d`

Triggers on push/PR to `main`.

---

## Branch Conventions

- `main` — production-ready
- Feature work is PR-based; merge to `main` after CI passes
- Current AI development branch: `claude/add-claude-documentation-PntuK`

---

## Common Make Targets

```bash
make dev          # Start backend in dev mode
make test         # Run tests
make build        # Docker build
make up           # docker-compose up
make down         # docker-compose down
make logs         # Follow container logs
make health       # Ping /health endpoint
make db-migrate   # Run migrations
make deploy       # Production deployment
```

---

## Notes for AI Assistants

- The WeChat Mini Program has **no build step**; edits to `pages/` and `utils/` take effect after saving in WeChat DevTools.
- Backend code lives entirely under `server/`; do not confuse root-level JS files (Mini Program) with Node.js server code.
- The `web/` directory is an independent Vue app with its own `package.json` and `node_modules`.
- OCR parsing is async — never assume `structured` is populated immediately after upload.
- The `idempotency_key` on applications prevents duplicate submissions; do not remove this constraint.
- Do not hardcode secrets; all sensitive values belong in `.env` (never committed).
- When adding new API routes, register them in the appropriate file under `server/routes/` and document the route in this file.
- Admin exports support both JSON and CSV via a `?format=csv` query param.
