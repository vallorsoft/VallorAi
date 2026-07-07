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
6. **Language** — every user-facing string in `apps/web` MUST go through the i18n dictionary
   (`apps/web/src/locales/`), never hardcoded inline. Romanian is the default locale; Hungarian
   and English are supported and switchable at runtime. See "Internationalization" below.

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
System prompts (ro/en/hu, selected via `getSystemPromptForLanguage`): `apps/api/src/modules/ai/prompts/system.prompt.ts`

## Internationalization (i18n)
Three supported locales: `ro` (default) · `hu` · `en`. Structure:
- `apps/web/src/locales/types.ts` — the `Dictionary` interface (single source of truth for shape) + `LOCALES`/`DEFAULT_LOCALE`
- `apps/web/src/locales/{ro,hu,en}.ts` — one dictionary per language, each `satisfies Dictionary` (TS enforces every language has every key — a missing translation is a compile error, not a silent fallback)
- `DATE_LOCALES` (also in `types.ts`) — BCP-47 tag per locale (`ro-RO`/`hu-HU`/`en-US`) for `Date#toLocaleDateString(DATE_LOCALES[locale])` and similar formatting
- `apps/web/src/store/locale.store.ts` — Zustand store (persisted to localStorage) holding the active locale
- `apps/web/src/lib/useTranslation.ts` — `const { t, locale, setLocale } = useTranslation()`; use `t.section.key` in components, never a hardcoded string
- `apps/web/src/components/layout/LanguageSwitcher.tsx` — the RO/HU/EN toggle (mounted in the auth layout header and the dashboard `TopBar`); also best-effort syncs the choice to `PATCH /users/me { language }` so the backend `User.language` field (and therefore the AI system prompt language — see `apps/api/src/modules/ai/prompts/system.prompt.ts`) follows the same preference for logged-in users

**Adding a new user-facing string**: add the key to `Dictionary` in `types.ts` first, then fill in all three locale files (TS will error on any file missing it), then consume it via `t.x.y` in the component. Do not add a fourth "just for now" hardcoded string anywhere — extend the dictionary instead, even for a single word.

Every page and component is migrated as of this writing: auth (`RegisterForm`/`LoginForm`/`VerifyEmailHandler`), the landing page, `Sidebar`/`TopBar`, the projects list/detail pages, the floor-plan editor (`EditorLayout`/`EditorToolbar`/`RoomPanel`), and `AiChat`. The only known exceptions are Next.js `metadata` (page `<title>`) exports — those are server-rendered and can't reactively follow the client-side locale store without a bigger routing change, so they stay hardcoded in Romanian; this is an accepted limitation, not a bug. Any brand-new page/component must follow the same pattern from day one.

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
