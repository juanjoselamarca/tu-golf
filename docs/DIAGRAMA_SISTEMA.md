# Diagrama del sistema — Golfers+

Vista de 1 página del sistema completo. Frontend, backend, BD y servicios externos.

## Diagrama ASCII

```
                       ┌─────────────────────────────────┐
                       │         USUARIOS                │
                       │  - Jugadores (móvil)            │
                       │  - Organizadores (móvil/web)    │
                       │  - Espectadores (móvil/web)     │
                       │  - Admins (web)                 │
                       └────────────┬────────────────────┘
                                    │ HTTPS
                                    ▼
           ┌────────────────────────────────────────────────┐
           │        VERCEL EDGE (golfersplus.vercel.app)    │
           │                                                │
           │  ┌─────────────────────────────────────────┐   │
           │  │  Next.js 14 App Router                  │   │
           │  │                                         │   │
           │  │  src/middleware.ts → auth + redirect    │   │
           │  │                                         │   │
           │  │  src/app/                               │   │
           │  │    page.tsx (landing)                   │   │
           │  │    dashboard/                           │   │
           │  │    ronda-libre/** (flujo crítico)       │   │
           │  │    torneo/**                            │   │
           │  │    perfil/**                            │   │
           │  │    admin/** (role-gated)                │   │
           │  │    api/** (server routes)               │   │
           │  └─────────────────────────────────────────┘   │
           │                                                │
           │  ┌─────────────────────────────────────────┐   │
           │  │  Vercel Cron (vercel.json)              │   │
           │  │   08:00 UTC → /api/cron/health-check    │   │
           │  │   03:00 UTC → /api/cron/taiger-insights │   │
           │  └─────────────────────────────────────────┘   │
           └────────────┬───────────┬──────────────┬────────┘
                        │           │              │
                        │           │              │
       ┌────────────────┘           │              └──────────────┐
       │                            │                             │
       ▼                            ▼                             ▼
┌─────────────────┐  ┌──────────────────────────┐  ┌──────────────────────┐
│ SUPABASE        │  │ ANTHROPIC API            │  │ SERVICIOS AUX        │
│                 │  │                          │  │                      │
│ Postgres:       │  │ Claude (tAIger+ coach)   │  │ Sentry (errores)     │
│  - profiles     │  │ - /api/taiger/chat       │  │ PostHog (analytics)  │
│  - tournaments  │  │ - /api/taiger/context    │  │ Web Push (VAPID)     │
│  - rounds       │  │ - /api/taiger/patterns   │  │ FedeGolf API         │
│  - hole_scores  │  │ - /api/taiger/analyze    │  │   (índices WHS)      │
│  - rondas_libres│  │                          │  │ Garmin ZIP import    │
│  - ronda_libre_ │  │ Gemini API (backup/OCR)  │  │                      │
│    jugadores    │  │ - /api/import/screenshot │  │                      │
│  - players      │  └──────────────────────────┘  └──────────────────────┘
│  - handicap_    │
│    history      │
│  - taiger_      │
│    sessions     │
│  - player_      │
│    patterns     │
│  - health_check_│
│    log          │
│  - push_        │
│    subscriptions│
│                 │
│ Auth (email)    │
│ Storage (fotos) │
│ RLS por tabla   │
└─────────────────┘
```

## Flujo típico: jugador scorea durante torneo

```
1. Jugador abre app → middleware valida sesión → dashboard
2. Click "Ronda Libre" → wizard (src/app/ronda-libre/nueva/page.tsx)
3. Crea ronda → POST /api/ronda-libre/create → insert en rondas_libres + ronda_libre_jugadores
4. Comparte código → otros jugadores se unen vía /ronda-libre/[codigo]
5. Scorea hoyo a hoyo:
    - Optimistic UI (src/hooks/useScoreSync.ts)
    - Offline queue (src/lib/score-storage)
    - Sync → POST /api/game o upsert directo
    - RLS valida: user_id del jugador == row.user_id
6. Realtime update:
    - Supabase realtime → otros dispositivos del grupo
    - Leaderboard espectador refresca automáticamente
7. Finaliza ronda:
    - Update rondas_libres.estado = 'finalizada'
    - Trigger BD: patterns_need_recalc = TRUE (en player_patterns)
    - Cron taiger-insights luego calcula patrones nuevos
```

## Flujo típico: espectador mira leaderboard

```
1. Usuario abre /ronda-libre/[codigo]/score-grupo o /en-vivo/[codigo]
2. Página hace query inicial (SSR o client-side)
3. Subscribe a Supabase realtime channel (canal = ronda_id)
4. Cada cambio en hole_scores actualiza la UI sin refresh
5. No requiere sesión — leaderboards espectador son públicos
```

## Archivos críticos (single-point-of-failure)

Ver `docs/ADRs/ADR-006-archivos-protegidos.md`:

- `src/middleware.ts` → auth global
- `src/app/layout.tsx` → HTML shell
- `src/components/Navbar.tsx` → presente en todas las páginas
- `src/lib/supabase.ts` → cliente singleton browser

Cambios en estos archivos requieren protocolo especial.

## Dependencias externas críticas

| Servicio | Criticidad | Degradación si cae |
|---|---|---|
| Vercel | P0 | App no accesible |
| Supabase | P0 | No se puede scorear, no hay data |
| Anthropic API | P2 | tAIger+ no responde, scoring sigue funcionando |
| Sentry | P3 | Errores no se capturan (pero app funciona) |
| PostHog | P3 | Analytics no se captura (pero app funciona) |
| FedeGolf API | P3 | Sync de índices WHS no funciona |
| Gemini API | P3 | OCR de scorecards no funciona |

## Variables de entorno

Server-side (en Vercel secrets):
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (también al cliente)
- `SUPABASE_SERVICE_ROLE_KEY` (solo server — bypassa RLS)
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` (cuando esté)
- `VAPID_PRIVATE_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (también cliente)
- `NEXT_PUBLIC_SITE_URL`

Ver `.env.example` para lista completa.

## Telemetría y observabilidad

| Capa | Herramienta | Qué captura |
|---|---|---|
| Errores runtime | Sentry | Stack traces + user context + release |
| Analytics comportamiento | PostHog | Eventos + funnels + retención |
| Performance Vercel | Vercel Analytics | LCP, FCP, TTFB por ruta |
| Health check BD + integraciones | Cron diario `/api/admin/health-check` | Snapshot en `health_check_log` |

Ver `docs/RUNBOOKS/ops-health-check.md` para operación.

## Deploy pipeline

```
git push origin main
    ↓
GitHub Actions CI (.github/workflows/ci.yml)
    ├── tsc --noEmit
    ├── vitest run
    └── next build (con env placeholders)
    ↓
Vercel Build (parallel, con secrets reales)
    ↓
Deploy a production (instant alias swap)
    ↓
Post-deploy: cron health-check valida
```

Rollback: ver `docs/RUNBOOKS/ops-deploy-rollback.md` (instantáneo vía Vercel promote).
