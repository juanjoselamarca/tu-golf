# Funnel Tracking Plan — FTUE Organizar Torneo Equipos

> Auditoría FASE 3 · 2026-05-22 · Scope: tracking plan para medir drop-off desde "click en link de invitación / landing" hasta "torneo de equipos creado y compartido". Output destinado al doc maestro de auditoría.

## 1. Estado actual de analytics

**Instalado y montado:**
- `posthog-js` v1.364.2 (`package.json`).
- `src/components/PostHogProvider.tsx` — wrapper cliente con `autocapture: true`, `capture_pageview: true`, `capture_pageleave: true`, `respect_dnt: true`, `ip: false`, persistencia `localStorage`.
- Montado en `src/app/layout.tsx:98` (envuelve toda la app).
- CSP en `next.config.js:21` permite `https://us.i.posthog.com`.
- Env var requerida: `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` (si falta, el init es no-op silencioso).

**Eventos custom: CERO.**
Grep en `src/**/*.{ts,tsx}` de `posthog.capture(`, `track(`, `mixpanel`, `va.track`, `gtag(`, `@vercel/analytics` → **ningún match operativo**. Solo PostHog aparece en `PostHogProvider.tsx` (init) y `src/lib/error-tracking.ts` (`captureException`).

**Lo que SÍ se está capturando hoy:**
1. **Pageviews automáticos** vía `capture_pageview: true` — rutas, referrer, UTMs, device. Útil pero no permite cortar por "intención" (e.g. "elegí formato best_ball").
2. **Autocapture** vía `autocapture: true` — clicks en elementos con texto/atributos. Demasiado ruidoso para un funnel formal: el evento `$autocapture` agrupa por selector CSS y se rompe al refactorizar.
3. **Errores** vía `captureException` en `src/lib/error-tracking.ts:64` (solo cliente, contexto + meta).
4. **Funnel artesanal en `/admin/analytics`** (`src/app/admin/analytics/page.tsx:19`) — construido sobre Supabase (`registered → firstRound → historicalCard → taiger → pro`), NO sobre eventos PostHog. Mide outcomes en BD, no comportamiento intermedio. Drop-off entre "vio landing" y "se registró" es invisible.

**No instalado:** `@vercel/analytics`, Mixpanel, GA4. PostHog es la única plataforma viva.

## 2. Mapeo del flujo (rutas/archivos reales)

Hay **dos personas** que entran al funnel:

### A. Organizador (crea el torneo)

| # | Step | Ruta | Archivo:línea clave |
|---|---|---|---|
| O1 | Landing pública | `/` | `src/app/page.tsx:49` (HeroSection, FEATURES con CTAs a `/demo`, `/indices`, `/register`) |
| O2 | Click "Probar gratis" / "Crear cuenta" | → `/register` | `src/app/page.tsx:27` |
| O3 | Form signup (email+pwd o Google) | `/register` | `src/app/register/page.tsx:101` (Google), `:115` (submit), `:128` (`supabase.auth.signUp`), `:144` (confirmación email), `:151` (push a dashboard) |
| O4 | Email confirmation pendiente (si email/pwd) | inline state | `src/app/register/page.tsx:147` `setPendingConfirmation(true)` |
| O5 | OAuth/email callback | `/auth/callback` | `src/app/auth/callback/route.ts:73` (PKCE), `:84` (OTP), `:78`/`:92` redirect a `next` |
| O6 | Aterrizaje post-signup | `/dashboard?welcome=true` | `src/app/dashboard/page.tsx:25` (lee `welcome` pero **no lo usa**, `void params`) |
| O7 | Click "Organizar torneo" | → `/organizador/nuevo` | (CTA dashboard; no inspeccionado en este audit) |
| O8 | Modal "Empezar de cero / duplicar / reanudar draft" | `/organizador/nuevo` | `src/app/organizador/nuevo/TournamentDraftEditor.tsx:184` (`handleStartFromScratch`), `:206` (duplicate), `:232` (resume) |
| O9 | Wizard: sección "Qué torneo" (nombre, fecha) | `/organizador/nuevo?draft=:id` | `src/app/organizador/nuevo/sections/QueTorneoSection.tsx:44` (name), `:55` (date) |
| O10 | Wizard: sección "Cómo juegan" (formato) | idem | `src/app/organizador/nuevo/sections/ComoJueganSection.tsx:32` (`setFormat`), `:58` (chip click). **Decisión clave del audit: elegir `best_ball` / `scramble` / `foursome`.** |
| O11 | Wizard: sección "Equipos" (visible solo si formato es team) | idem | `src/app/organizador/nuevo/sections/EquiposSection.tsx:24` (gate), `:45` (`update({ size })`), `:62` (handicap_pct), `:formation_mode` |
| O12 | Otras secciones: Rondas, Tees, Categorías, Stableford, MatchPlay, Inscripción, Premios, Admins | idem | `src/app/organizador/nuevo/sections/*.tsx` |
| O13 | Preview modal | inline | `src/app/organizador/nuevo/TournamentDraftEditor.tsx:241` (`handlePreview`) |
| O14 | Publicar → POST `/api/torneos/draft/:id/create-tournament` | server route | `src/app/organizador/nuevo/TournamentDraftEditor.tsx:245-268` (`handleCreate`), `src/app/api/torneos/draft/[id]/create-tournament/route.ts:29` (validación zod + golf rules) |
| O15 | Aterrizaje en panel de jugadores | `/organizador/:slug/jugadores` | `src/app/organizador/nuevo/TournamentDraftEditor.tsx:268`, `src/app/organizador/[slug]/jugadores/page.tsx:42` |
| O16 | Copy link de invitación | inline | `src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx:583` (click), `:584` (link `/torneo/:slug/unirse`), `:585` (clipboard) |
| O17 | Copy código corto | inline | `src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx:626` |

### B. Invitado (recibe link y se une)

| # | Step | Ruta | Archivo:línea clave |
|---|---|---|---|
| I1 | Click link de invitación | `/torneo/:slug/unirse` | (entry desde WhatsApp/email) |
| I2 | Gate auth: redirect a login si no autenticado | `/login?redirect=...` | `src/app/torneo/[slug]/unirse/page.tsx:67` |
| I3 | Signup/login y vuelta vía callback | `/auth/callback?next=...` | `src/app/auth/callback/route.ts:60` (`sanitizeNext`) |
| I4 | Carga datos del torneo | `/torneo/:slug/unirse` | `src/app/torneo/[slug]/unirse/page.tsx:64-110` (`loadData`) |
| I5 | Click "Inscribirme" | inline | `src/app/torneo/[slug]/unirse/page.tsx:402` → `:113` (`handleInscribirse`) |
| I6 | INSERT en `players` + `rounds` | Supabase | `src/app/torneo/[slug]/unirse/page.tsx:125`, `:153` |
| I7 | Errores: duplicate / RLS / not-null | inline | `src/app/torneo/[slug]/unirse/page.tsx:138-147` |
| I8 | Éxito | `setSuccess(true)` | `src/app/torneo/[slug]/unirse/page.tsx:159` |

**Sorpresa #1:** El parámetro `welcome=true` que pasa `register/page.tsx:150` al dashboard NO se consume — `dashboard/page.tsx:27` hace `void params`. Hay un evento "primer dashboard" que no tiene seguimiento.

**Sorpresa #2:** Inscripción del invitado es un INSERT directo cliente-side sin RPC, dependiente de RLS. El error de policy (`42501`) es un drop-off silencioso muy común y NO se loguea a PostHog (solo se muestra como toast).

## 3. Eventos a instrumentar (tabla)

Convención: `snake_case`, namespace por dominio (`auth_`, `org_`, `wizard_`, `invite_`, `join_`). Todos propagan automáticamente: `$current_url`, `$referrer`, UTMs (vía PostHog autocapture base) + propiedades custom debajo.

**User identification:** llamar `posthog.identify(user.id, { email, name, indice, created_at })` justo después del primer `getUser()` exitoso (sugerencia: en `PostHogProvider` con un `useEffect` que escuche `supabase.auth.onAuthStateChange` — pero NO async, ver `CLAUDE.md` regla anti-25-mar).

| # | event_name | Trigger | Archivo:línea sugerida | Propiedades clave |
|---|---|---|---|---|
| 1 | `landing_viewed` | mount home | `src/app/page.tsx:50` | `has_utm`, `utm_source`, `utm_campaign`, `is_returning` |
| 2 | `landing_cta_clicked` | click en FEATURE/STEP CTA | `src/app/page.tsx` (wrap Link en `<button onClick>` o usar `onClick` en Link) | `cta_id` (`probar_gratis` / `ver_demo` / `como_funciona`), `position` |
| 3 | `auth_signup_started` | submit form o click Google | `register/page.tsx:106` (Google), `:115` (email submit) | `method` (`google` / `email`), `has_redirect_to`, `redirect_to_kind` (`organizador_nuevo` / `unirse` / `dashboard`) |
| 4 | `auth_signup_succeeded` | después de `signUp` ok | `register/page.tsx:149` (rama email), callback OAuth (`auth/callback/route.ts:77`, requiere posthog-node o redirect a página intermedia que dispare) | `method`, `email_confirmation_required` (boolean), `had_indice_input` |
| 5 | `auth_signup_failed` | rama error de `signUp` | `register/page.tsx:139` | `method`, `error_code`, `error_field` |
| 6 | `auth_email_confirmation_pending` | render del estado pending | `register/page.tsx:165` (efecto al setear `pendingConfirmation`) | `email_domain` |
| 7 | `auth_email_resend_clicked` | click resend | `register/page.tsx:155` (`handleResend`) | `attempt_number` |
| 8 | `auth_login_started` | submit | `login/page.tsx:81`, `:65` | `method` |
| 9 | `auth_login_succeeded` | éxito | `login/page.tsx:93` | `method`, `redirect_to_kind` |
| 10 | `auth_login_failed` | error | `login/page.tsx:88` | `method`, `error_code` |
| 11 | `dashboard_first_visit` | mount con `welcome=true` | `dashboard/page.tsx:27` (hay que **consumir** el param y emitir client-side desde un hijo `'use client'`) | `time_to_first_dashboard_ms` (vs `signup_succeeded`) |
| 12 | `org_wizard_opened` | mount editor | `organizador/nuevo/page.tsx:60` (vía componente cliente hijo) | `entry_mode` (`fresh` / `with_draft_param` / `from_dashboard`), `had_existing_drafts` (count), `had_recent_tournaments` (count) |
| 13 | `org_draft_created` | success POST `/api/torneos/draft` | `TournamentDraftEditor.tsx:194` | `source` (`scratch` / `duplicate`), `source_tournament_id?` |
| 14 | `org_draft_resumed` | `handleResumeDraft` | `TournamentDraftEditor.tsx:233` | `draft_age_days`, `draft_completeness_pct` |
| 15 | `org_wizard_section_viewed` | scroll/focus en sección | cada `sections/*.tsx` (intersection observer común) | `section` (`que_torneo` / `como_juegan` / `equipos` / `rondas` / ...), `section_order` |
| 16 | `org_wizard_field_changed` | onChange relevante (debounce 800ms) | `QueTorneoSection.tsx:44, :55`, `ComoJueganSection.tsx:32`, `EquiposSection.tsx:45,62,formation_mode`, `RondasSection.tsx` (course/holes) | `section`, `field`, `value_kind` (no value para PII), `is_first_change_in_section` |
| 17 | `org_wizard_format_selected` | `setFormat` | `ComoJueganSection.tsx:32` | `format` (`stroke_play` / `stableford` / `best_ball` / `scramble` / `match_play` / `foursome`), `is_team_format` (boolean), `previous_format`, `time_since_wizard_open_ms` |
| 18 | `org_wizard_team_config_set` | primer cambio en EquiposSection | `EquiposSection.tsx:31` (`update`) | `format`, `team_size` (2/3/4), `handicap_pct`, `formation_mode` (`manual` / `random`) |
| 19 | `org_wizard_preview_opened` | `handlePreview` | `TournamentDraftEditor.tsx:241` | `sections_filled_count`, `validation_warnings_count` |
| 20 | `org_wizard_publish_attempted` | `handleCreate` start | `TournamentDraftEditor.tsx:245` | `format`, `is_team_format`, `time_in_wizard_ms`, `field_changes_count` |
| 21 | `org_wizard_publish_failed` | catch en handleCreate o 400/409 | `TournamentDraftEditor.tsx:252-265`, `create-tournament/route.ts:48` | `error_code` (`config_invalido` / `golf_rules` / `409` / `500`), `validation_issue_count`, `failed_field` |
| 22 | `org_tournament_created` | success | `TournamentDraftEditor.tsx:267` | `tournament_id`, `slug`, `format`, `is_team_format`, `team_size?`, `rounds_count`, `course_id`, `time_to_create_ms` (desde wizard open) |
| 23 | `org_invite_link_copied` | click copiar link | `JugadoresPanel.tsx:583` | `tournament_id`, `format`, `is_team_format`, `players_invited_count` (snapshot) |
| 24 | `org_invite_code_copied` | click copiar código | `JugadoresPanel.tsx:625` | idem |
| 25 | `invite_link_landed` | mount `unirse` | `torneo/[slug]/unirse/page.tsx:48` | `slug`, `is_authenticated`, `tournament_format`, `is_team_format`, `referrer_kind` (`whatsapp` / `direct` / `other`) |
| 26 | `invite_auth_redirect` | redirect a login | `unirse/page.tsx:68` | `slug`, `tournament_format` |
| 27 | `invite_tournament_loaded` | tournament+profile resueltos | `unirse/page.tsx:~105` | `slug`, `format`, `has_indice` (boolean), `course_handicap?` |
| 28 | `join_attempted` | click inscribirme | `unirse/page.tsx:113` | `slug`, `format`, `has_indice` |
| 29 | `join_succeeded` | INSERT ok | `unirse/page.tsx:159` | `slug`, `format`, `player_id`, `time_to_join_ms` (desde landing) |
| 30 | `join_failed` | branch error | `unirse/page.tsx:136-149` | `slug`, `error_kind` (`duplicate` / `rls_denied` / `null_field` / `unknown`), `pg_code` |
| 31 | `wizard_abandoned` | beforeunload con cambios sin publicar | hook global en `TournamentDraftEditor` | `last_section`, `sections_filled_count`, `time_in_wizard_ms` |

**Total: 31 eventos** (15 organizador wizard + 5 auth + 4 invitado join + 7 transversales).

## 4. Métricas derivadas (KPIs)

Dashboards a construir en PostHog Insights (cada uno toma de eventos arriba):

1. **Funnel Macro Organizador** (north star):
   `landing_viewed` → `auth_signup_started` → `auth_signup_succeeded` → `dashboard_first_visit` → `org_wizard_opened` → `org_wizard_format_selected` → `org_wizard_publish_attempted` → `org_tournament_created` → `org_invite_link_copied`.
   KPI: **conversion rate end-to-end (landing → invite copied)**. Hipótesis: <5% en cold traffic.

2. **Funnel Equipos Específico** (subset de #1):
   `org_wizard_format_selected` (where `is_team_format=true`) → `org_wizard_team_config_set` → `org_tournament_created` (where `is_team_format=true`).
   KPI: % de organizadores que eligen formato equipos vs individual; % que completan team_config tras elegirlo.

3. **Funnel Invitado**:
   `invite_link_landed` → `invite_auth_redirect`? → `invite_tournament_loaded` → `join_attempted` → `join_succeeded`.
   KPI: **join_rate por torneo** (`join_succeeded` / `invite_link_landed` deduplicado por user+slug). Drop alarma: <60%.

4. **Time-to-first-tournament (TTFT)**:
   median(`org_tournament_created.timestamp` − `auth_signup_succeeded.timestamp`).
   Cortar por: `method` (Google vs email), `had_indice_input`.

5. **Wizard friction map**:
   `org_wizard_section_viewed` count por sección vs `org_wizard_field_changed` count — secciones vistas y no editadas = candidatas a simplificar/colapsar. Equipos esperable que sea outlier por gate condicional.

6. **Format mix**: distribución de `org_wizard_format_selected.format`. Si `best_ball + scramble + foursome` < 20%, el wizard de equipos vale menos rediseño.

7. **Publish failure rate**:
   `org_wizard_publish_failed` / (`...failed` + `org_tournament_created`). Cortar por `error_code`. Si `golf_rules` domina → el validador está rechazando configs aparentemente válidas.

8. **Join failure rate por causa**: `join_failed.error_kind` distribution. `rls_denied` >5% = bug de policies (P0 según CLAUDE.md).

9. **Invite link decay**: histograma `time_between(org_invite_link_copied, first_invite_link_landed)`. Si la primera landing tarda >24h, hay que revisar canal de comunicación.

## 5. Stack recomendado

**Recomendación: PostHog único, no agregar Vercel Analytics ni Mixpanel.**

Razones:
1. **Ya está instalado, montado, con CSP abierta y env var documentada.** Costo marginal de uso = 0. Vercel Analytics duplicaría pageviews y partiría el funnel en dos plataformas (rota la atribución).
2. **PostHog ofrece Funnels, Cohorts, Session Replay y Feature Flags en el mismo backend**, que sirven para los Path Analyses del wizard sin moverse de tool.
3. **Vendor neutrality ya documentada** en `src/lib/error-tracking.ts:7-12` — la única función que toca PostHog directo. Si en el futuro Juanjo decide migrar, la captura está centralizable en un `src/lib/analytics.ts` análogo (recomendado en el plan de implementación abajo).
4. **Vercel Analytics es bueno para Core Web Vitals**, no para funnels comportamentales. Si más adelante queremos perf metrics, agregarlo es trivial y no compite.
5. **Server-side events** (post-OAuth callback, post-create-tournament en API route) requieren `posthog-node`. Es bajo riesgo: el cliente ya hace identify, server solo enriquece. Alternativa más simple: redirect a página intermedia (`/dashboard?welcome=true&event=signup_succeeded`) que un hijo `'use client'` consume y dispara — evita dependencia server-side.

## 6. Plan de implementación

**Fase 1 — Wrapper y identify (1h, riesgo bajo).**
- Crear `src/lib/analytics.ts` con función única `track(event: string, props?: Record<string, unknown>)` que internamente llama a `posthog.capture` y degrada a no-op si no hay token o si SSR. Misma forma vendor-neutral que `captureError`.
- En `PostHogProvider.tsx` agregar `useEffect` que escucha `supabase.auth.onAuthStateChange` (**NO async**, leer cuidado en `CLAUDE.md` § Patrones PROHIBIDOS Navbar — mismo patrón aplica aquí) y llama `posthog.identify(user.id, { ... })` y `posthog.reset()` en logout.
- Test canario en `src/__tests__/audit/` que verifica que `track` no rompa cuando posthog está disabled.

**Fase 2 — Eventos del organizador (3h).**
Instrumentar eventos **#3, #12, #13, #17, #18, #20, #21, #22, #23** (los 9 que componen el funnel macro + el del audit de equipos). Ignorar `wizard_field_changed` y `section_viewed` en fase 1 (alto volumen, baja señal).

**Fase 3 — Eventos del invitado (1.5h).**
Eventos **#25, #28, #29, #30**. El #30 es crítico: hoy el error de RLS es invisible.

**Fase 4 — Auth (1h).**
Eventos **#3, #4, #5, #8, #9, #10**. El #4 OAuth necesita dispararse desde un hijo client en `/dashboard` o `/perfil` consumiendo `welcome=true` (que hoy se descarta — `dashboard/page.tsx:27` `void params`).

**Fase 5 — Dashboards y alarmas (1h en PostHog UI, sin código).**
Crear los 9 Insights de la sección 4. Configurar alerta: `join_failed.error_kind = 'rls_denied'` > 3 eventos/hora → ping a Juanjo.

**Total estimado: ~7.5h de trabajo de CTO**, sin tocar archivos protegidos (Navbar, layout, middleware, supabase client). Cero riesgo de regresión a flow operativo: todos los `track` son fire-and-forget con try/catch idéntico al patrón de `captureError`.

**Gating:** la directiva CERO FALLOS aplica — antes de mergear, agregar e2e (`playwright`) que verifique que `track()` con PostHog deshabilitado (sin env var) no lanza. La app debe funcionar idéntica con analytics off.
