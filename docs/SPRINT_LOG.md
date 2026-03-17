# SPRINT LOG — TU GOLF

> Agregar nueva entrada AL INICIO después de cada sprint

---

## Sprint 10 — el tAIger v1 🐯
**Fecha:** 17 Mar 2026
**Estado:** ✅ COMPLETO

### Entregado
- @anthropic-ai/sdk integrado con modelo claude-sonnet-4-6
- src/lib/taiger-prompt.ts — system prompt v1.0 + context builder
- /api/taiger/chat — streaming SSE con Claude API
- /api/taiger/analyze-round — análisis post-ronda automático
- /coach/onboarding — 12 preguntas psicológicas, 1 a la vez
- /coach — dashboard con patrones, sesiones, freemium counter
- /coach/sesion/nueva — selector de tipo de sesión
- /coach/sesion/nueva/chat — chat streaming con follow-ups
- /coach/sesion/[id] — vista de sesión con seguimiento
- Integración automática post-ronda en scorecard
- "🐯 Mi Coach" en navbar desktop + mobile
- Health check Claude API corregido
- Freemium: 3 sesiones/mes, prevención duplicados
- Analytics: onboarding_completado, taiger_sesion_iniciada

---

## Admin Dashboard — 9 pestañas operacionales
**Fecha:** 17 Mar 2026
**Estado:** ✅ COMPLETO

### Entregado
- src/lib/admin.ts — seguridad por email
- src/lib/analytics.ts — tracking de eventos
- src/lib/supabaseAdmin.ts — cliente service-role
- ADMIN_SUPABASE.sql — analytics_events + vista admin_daily_metrics
- APIs: /api/admin/overview, users, activity, health
- Layout admin con sidebar responsive + header
- /admin — Overview con KPIs, gráfico actividad, health panel
- /admin/usuarios — tabla paginada con búsqueda y drawer lateral
- /admin/crecimiento — funnel activación + KPIs growth
- /admin/golf — métricas torneos, rondas, tarjetas, distribución HCP
- /admin/taiger — sesiones, patrones, costo API, system prompt
- /admin/monetizacion — MRR/ARR, proyecciones con slider, costos
- /admin/geografia — distribución países, canchas
- /admin/sistema — health check, BD metrics, env vars, errores
- /admin/configuracion — general, tAIger, admins
- Link admin en navbar (solo para juanjoselamarca@gmail.com)
- trackEvent en 4 puntos: ronda_creada, torneo_creado, tarjeta_historica, ronda_completada

---

## Sprint 9C — Fixes urgentes
**Fecha:** 17 Mar 2026
**Commit:** ae07373
**Estado:** ✅ COMPLETO

### Entregado
- Fix PGA widget invisible en mobile
- Fix error modo_juego — graceful fallback
- Historial siempre gross
- SQL idempotente
- CSS mobile responsive

---

## Sprint 9B — GWI + Gross/Neto/Stableford
**Fecha:** 17 Mar 2026
**Commit:** f73964b
**Estado:** ✅ COMPLETO

### Entregado
- src/lib/scoring.ts — matemáticas golf completas
- src/lib/gwi.ts — Golf Win Index con sigma por HCP
- GWILeaderboard.tsx — probabilidades de ganar
- APIs gwi para ronda libre y torneo
- Selector Gross/Neto/Stableford en formularios
- Scorecard modo-aware con chips correctos
- Vista espectador con badge de modo

---

## Sprint 9 — Data Foundation tAIger/Garmin
**Fecha:** 17 Mar 2026
**Commit:** 689d95c
**Estado:** ✅ COMPLETO

### Entregado
- Tablas: player_patterns, taiger_sessions, player_psych_profile, garmin_connections, handicap_history
- APIs: /api/taiger/context y /api/taiger/patterns
- src/types/database.ts completo
- src/constants/golf.ts con colores y labels
- Tarjetas históricas rediseño premium estilo Garmin Golf
- Animaciones: fadeInUp, shimmer, scoreChange, pulse
- Botones premium: .btn-primary y .btn-secondary
- PGA Widget v2 con badge PGA TOUR y nombres completos

---

## Sprint 8B — Mobile UX completo
**Fecha:** 17 Mar 2026
**Commit:** e96c321
**Estado:** ✅ COMPLETO

### Entregado
- Navbar con drawer bottom sheet en mobile
- Scorecard hoyo a hoyo con swipe gestures
- Touch targets 44px mínimo en toda la app
- Haptic feedback al cambiar scores
- Safe area para iPhone notch
- Cards responsive con animaciones

---

## Sprint 8 — Features completos
**Fecha:** 16 Mar 2026
**Commit:** 51ed0a6
**Estado:** ✅ COMPLETO

### Entregado
- Ronda Libre: crear, scorecard hoyo a hoyo, vista espectador/jugador con selector de rol
- Widget PGA Tour en vivo con ESPN API
- Historial 50 tarjetas manuales
- QR Code del torneo
- Perfil del jugador /perfil
- Modo TV /torneo/[slug]/tv
- Dashboard con métricas reales de BD
- Campos opcionales: putts, GIR, fairway hit
- Stats post-torneo (6 cards)
- Banderas de países con flagcdn.com

---

## Sprint 7 — Core funcional
**Fecha:** 16 Mar 2026
**Commit:** e2879c1
**Estado:** ✅ COMPLETO

### Entregado
- Scoring desde celular /torneo/[slug]/score
- Deep link login con ?redirect=
- Categorías personalizadas con chips editables
- Editar torneo pre-cargado con datos reales
- Historial torneos jugados en dashboard
- Fix handicap negativo en dropdown jugadores
- Seguridad /api/game con validación organizer_id

---

## Sprint 1-6 — Base del proyecto
**Estado:** ✅ COMPLETO

### Entregado
- Auth Google OAuth + email/magic link + PKCE fix
- Crear torneos completo con todas las opciones
- Inscribir jugadores con handicap WHS
- Scoring en tiempo real con leaderboard
- Leaderboard premium con categorías y flights
- Deploy Vercel + Supabase configurado
