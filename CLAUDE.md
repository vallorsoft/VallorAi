# AI Home Designer — CLAUDE.md

## Project overview
AI-powered architectural SaaS targeting the Romanian market (first), then European expansion.
Primary language: Romanian. Monorepo: pnpm + Turborepo.

## Architecture
```
vallorai/
├── apps/
│   ├── api/        NestJS 10 + Fastify — REST API v1
│   └── web/        Next.js 14 App Router — Frontend
├── packages/
│   ├── types/      Shared TypeScript interfaces
│   ├── database/   Prisma schema + PrismaClient singleton
│   └── ai-gateway/ Provider-agnostic AI adapter (Claude, OpenAI, …)
```

## Key rules (never break these)
1. **Do NOT invent requirements** — follow only the PDF specs in `docs/materials/`
2. **Romanian Building Rules Engine** = deterministic TypeScript, NOT AI
3. **AI Gateway** must remain provider-agnostic (`AIAdapter` interface)
4. **Clean Architecture + SOLID** — modules stay decoupled
5. **Branch workflow** — develop on `claude/web-project-setup-39afuw`, PRs target `main`
6. **Language** — all user-facing strings Romanian first, then Hungarian/English

## Running locally
```bash
# Install
pnpm install

# Environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Fill in DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY

# Database
pnpm db:push     # push schema to Neon
pnpm db:studio   # Prisma Studio

# Dev servers (runs both api + web)
pnpm dev
```

## API base URL
`http://localhost:3001/api/v1`  
Swagger docs: `http://localhost:3001/api/docs` (dev only)

## Auth
JWT Bearer tokens. accessToken expires in 15 min, refreshToken 30 days.
Stored in localStorage by the web app; interceptor auto-refreshes on 401.

## AI configuration
Set `AI_PROVIDER=claude` (default) or `openai` in `apps/api/.env`.
Model defaults: `claude-sonnet-5` / `gpt-4o`.
System prompt (Romanian): `apps/api/src/modules/ai/prompts/system.prompt.ts`

## Database models (key ones)
User → Project → House → Room / Wall / Opening
Project → Plot / Lifestyle / Budget / CostEstimate / Document / Message

## Romanian Building Rules
Validated in `apps/api/src/modules/rules/rules.service.ts`.
Returns `ValidationResult` with `violations[]`, `passedRules[]`, `permitReadiness` (%).
Permit docs: DTAC, PTh, DDE, PAC, POE.

## Deployment targets
- **API**: Fly.io (Node.js)
- **Web**: Vercel or Fly.io static
- **DB**: Neon PostgreSQL
- **Storage**: Cloudflare R2

## SaaS plans
FREE · PRO · BUSINESS · ENTERPRISE

## User roles
GUEST · USER · CLIENT · ARCHITECT · STRUCTURAL_ENGINEER · MEP_ENGINEER ·
ELECTRICAL_ENGINEER · CONTRACTOR · MANUFACTURER · SUPPLIER · ADMIN

## Spec documents
All 13 PDFs in `docs/materials/` are the source of truth.
Never add functionality not described there.
