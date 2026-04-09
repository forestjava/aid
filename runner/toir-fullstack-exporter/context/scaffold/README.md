# TOiR Fullstack Application

Fullstack API + Admin UI, generated from DSL contract. Keycloak-protected backend, React Admin frontend.

## Stack

- **Backend**: NestJS 11, Prisma 6, Postgres 16
- **Frontend**: React 19, React Admin 4, TypeScript
- **Auth**: Keycloak (OIDC)
- **Deploy**: Docker Compose, managed via Portainer + NPM

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Start dev containers
docker compose up -d

# Migrate database
npm run db:migrate:dev

# Run backend
npm run dev:api

# Run frontend (separate terminal)
npm run dev:ui
```

## Environment

See `.env.example` for required variables. Key settings:
- `KEYCLOAK_URL` — Keycloak realm issuer
- `POSTGRES_PASSWORD` — DB password
- `VITE_API_URL` — Backend API endpoint for frontend

## Project Structure

- `server/` — NestJS API
  - `src/modules/` — Auto-generated entity modules
  - `src/auth/` — Auth guards, JWT validation
  - `prisma/schema.prisma` — Database schema
- `client/` — React Admin UI
  - `src/resources/` — Auto-generated resource views
  - `src/auth/` — Auth provider, token management
  - `src/App.tsx` — Root component

## Database

Schema auto-generated from DSL. Migrate:

```bash
npx prisma migrate dev --name init
```

## Troubleshooting

### Backend won't start
Check `POSTGRES_URL` in `.env`, ensure Postgres container is healthy (`docker ps`).

### Frontend auth fails
Verify `KEYCLOAK_URL` is accessible, client ID registered in Keycloak.

### Type errors in IDE
Run `npm install` to regenerate Prisma types, then restart IDE.
