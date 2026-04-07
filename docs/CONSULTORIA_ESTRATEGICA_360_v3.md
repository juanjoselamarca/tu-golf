# CONSULTORÍA ESTRATÉGICA 360° — GOLFERS+
**Estilo: BCG / McKinsey / Bain**
**Versión 3.0 · 31 marzo 2026 — Corregida y verificada por CTO**

---

## ROL Y ENCUADRE

Actúas como un equipo senior de consultoría estratégica de primer nivel (BCG / McKinsey / Bain), con práctica especializada en:
- Estrategia de producto digital y startups SaaS en etapa temprana
- Customer Experience (CX) y diseño de producto mobile-first
- Modelos de negocio en mercados emergentes latinoamericanos
- Monetización, retención y growth de aplicaciones deportivas

Tu cliente es **Golfers+**, una plataforma digital para golfistas amateurs hispanohablantes construida por un founder/PM no técnico en Santiago, Chile, con Claude Code como único desarrollador. Se te entrega acceso completo al stack técnico, los documentos de diseño, el historial de sprints, los resultados de pruebas reales y los KPIs objetivo.

Tu misión: una **consultoría completa de 360°** con el rigor analítico de BCG pero ejecutable por 1 persona + IA, sin inversión externa y con presupuesto limitado.

**Regla de oro:** no halagues el producto por ser interesante. Evalúalo con el mismo estándar con que BCG evaluaría un producto de una empresa grande. Las contradicciones entre la visión declarada y el estado real son los insights más valiosos.

---

## PASO OBLIGATORIO ANTES DE ANALIZAR

Antes de responder cualquier bloque, leer en este orden:
1. `CLAUDE.md` — reglas del proyecto, stack, protocolos de seguridad, archivos protegidos
2. `docs/ARQUITECTURA.md` — motor golf/, design system, DB naming conventions
3. `docs/SPRINT_LOG.md` — historial completo de desarrollo (10+ sesiones documentadas)
4. `docs/ROADMAP_COMPLETO.md` — roadmap oficial sprints 9C–14 + 7 ideas profundas
5. `docs/BACKLOG_PRIORIZADO_2026-03-17.md` — backlog priorizado de auditoría técnica
6. `docs/INFORME_FINAL_CONSOLIDADO_2026-03-17.md` — auditoría senior de readiness
7. `GOLFERS_PLUS_MAESTRO.md` — contexto maestro del producto (verificar vs estado real)
8. Verificar producción: `curl https://golfersplus.vercel.app/api/health`

---

## CONTEXTO REAL DEL PRODUCTO (estado verificado al 31 marzo 2026)

### Los tres productos

**PRODUCTO 1 — Live Scoring de Rondas**
El organizador crea una ronda (torneo, ronda libre o liga) en 2 minutos. Los jugadores marcan score hoyo a hoyo desde el celular. El leaderboard es público en tiempo real. Aplica a torneos formales y a cualquier grupo de amigos jugando juntos.

**PRODUCTO 2 — Perfil de Rendimiento (CPI™ + Índice Dual)**
El Current Performance Index mide el momentum del jugador (0–100) usando diferencial ponderado por recencia, consistencia (StdDev), tendencia, y volumen de rondas. Complementado por el **Índice Golfers+** (fórmula USGA oficial: mejores N diferenciales de últimas 20 rondas × 0.96) que coexiste con el Índice de Federación (manual). Ambos se muestran en el perfil. CPI se cachea en `profiles.cpi_score`.

**PRODUCTO 3 — tAIger+**
Coach de rendimiento con IA (Claude API, modelo `claude-sonnet-4-6`) con acceso a todos los datos del jugador, sus patrones detectados (7 detectors activos), índice dual, y nivel. Combina Strokes Gained (Broadie) con psicología deportiva (Rotella, VISION54, ACSI-28, SMTQ). No dice "practica más" — dice exactamente qué practicar, por qué, cómo medirlo, y qué hacer cuando la cabeza sabotea en el hoyo 14.

**Distinción crítica — CPI™ vs GWI™ (nunca confundirlos):**
```
CPI™ (Current Performance Index) — Escala 0–100
  → Del jugador individual. Siempre existe. Persiste en BD (profiles.cpi_score).
  → Factores: diferencial ponderado por recencia, consistencia, tendencia, volumen.
  → Base de todos los análisis de tAIger+.

GWI™ (Golf Win Index)
  → De la ronda activa con ≥2 jugadores — torneo, ronda libre o liga.
  → Modelo Bradley-Terry: probabilidad de victoria en tiempo real.
  → NO persiste en BD. Desaparece cuando la ronda se cierra.
  → Para espectadores y organizadores.

Índice Golfers+ (NUEVO — 30 Mar 2026)
  → Fórmula USGA oficial calculada automáticamente por la app.
  → Coexiste con el Índice Federación (manual, nunca tocado por la app).
  → Persiste en BD (profiles.indice_golfers).
  → Se recalcula al registrar ronda, importar, o agregar manual.
```

### Stack técnico real
```
Frontend:  Next.js 14 (App Router) · TypeScript · Tailwind CSS
Backend:   Next.js API Routes (serverless en Vercel)
BD:        Supabase Postgres + RLS
Auth:      Supabase Auth (OAuth Google + magic link)
IA:        Anthropic Claude API (claude-sonnet-4-6) — key activa y pagada
Monitoring: Sentry (errores) + PostHog (analytics) + Health Check (19 tests automáticos)
Deploy:    Vercel (auto-deploy en push a main) + pre-push hooks (tsc + tests + build)
Dev:       1 founder no técnico + Claude Code como único desarrollador
Tests:     27 tests canario (Vitest) + pre-push hooks obligatorios
```

### Design system real (verificado 31 marzo 2026)
```
REFERENCIA VISUAL: Bloomberg Terminal + F1 telemetry + golf club premium
MOOD: oscuro, elegante, basado en datos — el gold se siente ganado

COLORES:
  #070D18  — fondo página (dark navy permanente)
  #0E1C2F  — cards y panels
  #C4992A  — gold único acento caliente (CTAs, tab activo, líder #1)
  #EDE9E4  — texto principal (nunca blanco puro)
  rgba(255,255,255,0.35) — labels secundarios
  #16a34a  — positivo (CPI sube, bajo par, birdie)
  #dc2626  — negativo (CPI baja, sobre par, doble+)
  REGLA ABSOLUTA: cero naranja — solo dorado #C4992A como acento caliente

TIPOGRAFÍA:
  Cormorant Garamond 300 — SOLO números grandes impactantes (CPI gauge, índices)
  Playfair Display 700 — títulos y branding
  DM Sans 400/500/600 — toda la UI (body, botones, labels, scores)
  DM Mono uppercase — etiquetas de métricas: "CPI™" · "GWI™" · "CAT. A" · "PAR 72"

INDICADORES DE SCORE — convención universal golf (src/golf/core/colors.ts):
  Eagle o mejor:  círculo azul oscuro
  Birdie:         círculo celeste
  Par:            sin borde
  Bogey:          cuadrado dorado/naranja
  Doble bogey+:   cuadrado rojo

CELEBRACIONES (implementadas — src/components/):
  Birdie:      overlay sutil, ring celeste, auto-close 1.5s
  Eagle:       20 partículas confeti azul/dorado, auto-close 2.5s
  Hole-in-one: 50 partículas doradas, fullscreen, auto-close 6s
  Todas con: role="alert", aria-label, Escape key para cerrar

COMPONENTES IMPLEMENTADOS:
  HoleColorBar.tsx — barra de colores por tipo de score (reutilizable)
  ScoreSymbol.tsx — círculo/cuadrado PGA por resultado
  BirdieCelebration.tsx, EagleCelebration.tsx, HoleInOneCelebration.tsx
```

### Schema de BD real (verificado contra producción 31 marzo 2026)
```sql
profiles (id, email, name, role, indice DECIMAL(4,1),
          indice_golfers DECIMAL(4,1), indice_golfers_updated_at TIMESTAMPTZ,
          nivel INTEGER DEFAULT 1, nivel_updated_at, nivel_expires_at,
          cpi_score DECIMAL, cpi_updated_at, cpi_trend, cpi_status,
          avatar_url, patterns_need_recalc, analysis_level, golf_goals)

tournaments (id, name, slug UNIQUE, organizer_id, course_name, course_id UUID,
             date_start DATE, format, hole_count, use_handicap, tees, modo_juego,
             slope_rating INTEGER, course_rating DECIMAL, status, cover_image_url)

players (id, tournament_id, user_id, category_id, flight_id,
         handicap_at_registration DECIMAL, status CHECK('pending','approved','waitlist','withdrawn'))

rounds (id, tournament_id, player_id,
        status CHECK('in_progress','closed','official'),
        total_gross, total_net, total_points, started_at, closed_at)

hole_scores (id, round_id, hole_number, par, gross_score, net_score, points,
             source CHECK('manual_player','manual_organizer','garmin','garmin_provisional'),
             status CHECK('pending','loaded','confirmed','corrected','provisional'),
             putts, fairway_hit, gir)

historical_rounds (id, user_id, course_name, course_id, played_at, total_gross,
                   scores JSONB, holes_played, tee_color,
                   slope_rating INTEGER, course_rating DECIMAL, diferencial DECIMAL(5,2),
                   import_source, import_confidence, metadata JSONB, garmin_scorecard_id,
                   notes, privacy)

rondas_libres (id, codigo, creador_id, course_id, course_name, tees, holes, fecha,
               estado CHECK('en_curso','finalizada'), modo_juego, hoyo_inicio,
               admin_mode, admin_user_id)

ronda_libre_jugadores (id, ronda_id, nombre, user_id, scores JSONB,
                       is_guest, nombre_invitado, telefono_invitado)

courses (id, nombre, ciudad, pais, slope_rating, course_rating, par_total,
         tipo_recorrido, parent_id, loop_nombre, datos_verificados, activa)

course_holes (id, course_id, numero, par, stroke_index,
              yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo)

taiger_sessions (id, user_id, session_type, tournament_id, ronda_libre_id,
                 messages JSONB, techniques_assigned, mental_notes, next_focus, rating)
```

**Convenciones de naming (source of truth: docs/ARQUITECTURA.md):**
- `profiles.indice` (NO handicap) — Índice Federación, manual
- `profiles.indice_golfers` — Índice Golfers+, calculado automáticamente
- `courses.nombre` (NO name) — nombre de cancha en español
- `tournaments.name` — nombre del torneo (en inglés en schema)
- `course_holes.numero` (NO hole_number)
- `rondas_libres.estado`: SOLO 'en_curso' | 'finalizada'
- `rounds.status`: SOLO 'in_progress' | 'closed' | 'official'

### Motor de reglas centralizado: src/golf/
```
src/golf/
├── core/       rules.ts, scoring.ts, compare.ts, colors.ts
├── formats/    stroke-play.ts, stableford.ts, GolfFormat interface
├── stats/      gwi.ts, cpi.ts, personal.ts
├── courses/    types.ts, data.ts, matching.ts
├── coach/      prompts.ts, patterns.ts (7 detectors), analysis.ts
└── notifications/  engine.ts, preferences.ts, types.ts
```

### Rutas en producción (37 páginas)
```
PÚBLICAS (sin auth):
  /                     Homepage con CTAs
  /demo                 Perfil demo Carlos Méndez — vitrina sin login
  /leaderboard          Demo leaderboard con simulación en vivo (GWI™)
  /en-vivo              Rondas activas en tiempo real
  /ronda-libre/[codigo] Vista espectador (scoring + leaderboard público)
  /torneo/[slug]        Leaderboard torneo público
  /login, /register, /recuperar
  /privacidad, /terminos, /reembolsos

PRIVADAS (auth required — middleware 307 redirect):
  /dashboard            Dashboard del usuario (CPI™, ronda activa, onboarding)
  /perfil               Índice dual (Federación + Golfers+) + badge nivel + CPI
  /perfil/historial     Historial de rondas + entrada manual
  /perfil/stats         Estadísticas avanzadas
  /coach                tAIger+ dashboard
  /coach/onboarding     12 preguntas perfil psicológico
  /coach/sesion/nueva   Nueva sesión de coaching
  /importar             Wizard importación (Garmin ZIP, screenshot OCR, CSV)
  /ronda-libre/nueva    Crear ronda libre (hasta 4 jugadores)
  /organizador/nuevo    Crear torneo
  /organizador/[slug]/jugadores  Gestión de jugadores
  /organizador/[slug]/scoring    Scoring organizador

ADMIN (auth + role=admin):
  /admin                Command Center (KPIs, activity chart, health grid)
  /admin/analytics      Growth funnel, activation metrics
  /admin/golf-ops       Torneos, rondas, usuarios, tAIger dashboard
  /admin/finanzas       Costos, proyecciones
  /admin/sistema        Health checks, debug, env vars
```

### Estado REAL de producción (verificado 31 marzo 2026)
```json
{
  "profiles": 25,
  "tournaments": 8,
  "players": 12,
  "historical_rounds": 378,
  "rounds_con_diferencial": 57,
  "usuarios_con_historial": 16,
  "rondas_libres": 39,
  "courses": 47,
  "course_holes": 180,
  "hole_scores": 169,
  "taiger_sessions": 0
}
```

**Datos del founder (Juanjo):** Índice Federación 10.5, Índice Golfers+ 12.8, Nivel 5 (Golfer+), CPI 39.57. 93 rondas históricas importadas (57 con diferencial válido de 18 hoyos).

**Nota crítica:** tAIger+ tiene 0 sesiones en producción. La API key está activa y pagada, pero ningún usuario ha usado el coach todavía. El motor de patrones tiene 7 detectors implementados pero sin uso real.

### Sprints completados (historial real — últimos 7 días)
```
Sesión 25-26 Mar:
  ✅ Restauración post-incidente (Navbar async causó caída 12h)
  ✅ 15 tests canario + pre-push hooks
  ✅ Sprint seguridad: 13 fixes (5 P0, 8 P1)
  ✅ Monitoreo Fase 1: health endpoint + cron + SystemStatusBanner

Sesión 30 Mar (sesión masiva — 20+ commits):
  ✅ Sentry + PostHog activados
  ✅ 10 mejoras UX para usuarios 60+
  ✅ Rebrand a golfersplus.vercel.app
  ✅ Arquitectura src/golf/ — motor centralizado
  ✅ Motor de notificaciones inteligente (shouldNotify)
  ✅ Celebraciones birdie/eagle/HIO con accesibilidad
  ✅ Fix seguridad: taiger/context filtraba datos de otros usuarios
  ✅ 45+ mensajes de error reescritos en español amigable
  ✅ golf/coach completo: 7 pattern detectors + analyzeRound()

Sesión 30 Mar (cont.) — Sprint Índice Dual:
  ✅ Migración SQL 010: indice_golfers + nivel + diferencial
  ✅ RPC calcular_indice_golfers() con fórmula USGA
  ✅ Diferencial guardado en 3 puntos de insert
  ✅ UI perfil: dos cards (Federación + Golfers+) + badge nivel
  ✅ Fix CHECK constraints (torneos + jugadores funcionando)
  ✅ Backfill de 57 diferenciales retroactivos
  ✅ /ronda-libre/nueva protegida por middleware
```

### Bugs conocidos del 24 marzo — estado actual
```
1. Score invisible (blanco/blanco): PARCIAL — scorecard tiene dark mode toggle
2. Chip de score ausente: INVESTIGAR — puede seguir presente
3. Toggle Scorecard/Leaderboard: IMPLEMENTADO — existe en score page
4. Diferencial incorrecto: CORREGIDO — usa vsPar, no gross vs par_total_72
5. HIO/Albatros/Eagle/Doble indicadores: CORREGIDO — ScoreSymbol.tsx + colors.ts
6. "Todos puntuaron" botón: NO IMPLEMENTADO
7. Score y botones solapados: INVESTIGAR
8. OUT/IN/TOTAL en historial: INVESTIGAR
9. "Handicap" visible en /perfil: PARCIAL — label de edición dice "Índice Federación" pero hay instancias de "Handicap" en la vista de lectura
10. /admin redirige: CORREGIDO — middleware verifica role=admin
```

### KPIs objetivo (12 meses)
```
RETENCIÓN:    60%+ de usuarios activos al mes 3
CONVERSIÓN:   15%+ de visitantes de /demo crean cuenta
MONETIZACIÓN: 200 suscriptores de pago a $4.990 CLP/mes (~$5 USD)
NPS:          70+
DATOS:        4+ rondas registradas por usuario activo/mes
VIRALIDAD:    El leaderboard de cada ronda trae 3+ visitantes nuevos
```

---

## LO QUE PASÓ EN LA PRUEBA 1 (21 marzo 2026) — DATOS REALES

Golfers+ tuvo su primera prueba real con usuarios en un torneo. Resultados mixtos. Estos son datos, no supuestos.

**Problemas detectados, priorizados por impacto:**

| Severidad | Problema | Implicación estratégica |
|-----------|---------|------------------------|
| CRÍTICO | Página en blanco para espectadores sin login | El espectador es el futuro usuario — bug de viralidad central |
| ALTO | Confusión general de usuarios nuevos | El onboarding no guía suficientemente |
| ALTO | Scorecard con problemas de UX en campo | El producto más crítico falla en condiciones reales |
| MEDIO | Links y notificaciones percibidos como intrusivos | Fricción en el momento de captación |
| MEDIO | Features que no funcionaron como se prometió | Brecha entre demo y realidad |

**Nota:** Varios de estos bugs fueron corregidos en las sesiones del 25-30 marzo (ver sprints completados arriba). El análisis debe distinguir entre bugs corregidos y bugs pendientes.

---

## INSTRUCCIONES PARA EL ANÁLISIS

Para cada bloque:
- Distingue **hallazgo** (qué observas), **diagnóstico** (por qué importa) y **recomendación** (qué hacer exactamente).
- Señala las **3 prioridades críticas** de cada bloque al inicio.
- Cuantifica. Usa benchmarks de la industria cuando no haya datos propios.
- Cierra cada bloque con tabla: **impacto** (Alto/Medio/Bajo) · **esfuerzo** · **plazo** (0–30 / 30–90 / 90+ días).
- Usa frameworks de consultoría (JTBD, Pirate Metrics, NPS drivers, etc.) para generar insights reales, no por nombrarlos.
- Contradicciones entre visión declarada y estado real = los insights más valiosos.

---

## BLOQUE 1 — AUDITORÍA TÉCNICA Y DE PRODUCTO

### 1.1 Stack y arquitectura — perspectiva de CTO externo
- ¿Es el stack (Next.js 14 + Supabase + Vercel + Claude API) correcto para esta etapa? ¿Dónde hay deuda técnica que ya limita el crecimiento?
- El scoring en vivo usa polling de 15-30s. ¿Es sostenible con 50+ espectadores simultáneos en un torneo real? ¿Cuándo se vuelve un problema de UX o de costo?
- ¿El RLS de Supabase está correctamente configurado? (Contexto: se detectaron filtros `user_id` faltantes — corregido el 30 Mar pero RLS SQL pendiente de ejecutar para algunas tablas)
- El modelo "1 founder no técnico + Claude Code como único dev": ¿qué riesgos introduce? ¿Cuál es el punto de quiebre?
- El incidente del 25 Mar (Navbar async = caída 12h) generó: pre-push hooks, 27 tests canario, archivos protegidos. ¿Es suficiente protección?
- ¿Cuáles son los 3 riesgos técnicos que pueden matar el producto en los próximos 6 meses?

### 1.2 Calidad del MVP — lo que un usuario de primera sesión encuentra HOY
- Evalúa la brecha entre /demo (vitrina) y la experiencia real en campo.
- 27 tests canario + pre-push hooks: ¿es suficiente? ¿Qué no cubre?
- El wizard /importar (3 vías: Garmin ZIP, screenshot OCR con Gemini, CSV) es la puerta al CPI™ real. ¿Está bien posicionado en el funnel?
- Con 378 rondas históricas y 0 sesiones de tAIger+, ¿qué calidad de coaching puede dar tAIger+ cuando alguien lo use? ¿Cuándo se vuelve genuinamente útil?

### 1.3 Escalabilidad futura
- ¿Qué necesita cambiar en la arquitectura para soportar 5.000 usuarios (Argentina + México, 2027)?
- El motor `src/golf/` centraliza scoring, formats, stats, courses, coach y notifications. ¿Es la arquitectura correcta?
- La API de Garmin Golf Premium requiere 500+ usuarios. ¿Es una dependencia o una oportunidad diferida?
- 47 canchas chilenas cargadas con 180 hoyos. ¿Es suficiente para el mercado local?

---

## BLOQUE 2 — MERCADO Y COMPETENCIA

### 2.1 Tamaño de mercado
- Estima TAM, SAM y SOM para Golfers+ en Chile y LatAm. Datos de FGCh, WAGC y benchmarks de apps deportivas en mercados similares.
- ¿Cuántos golfistas amateur activos hay en Chile, Argentina y México? ¿Qué porcentaje tiene smartphone y disposición de pago de $5 USD/mes?
- ¿Cuánto tardó Strava en monetizar en Chile/LatAm? ¿Qué puede aprender Golfers+ de ese camino?

### 2.2 Análisis competitivo

| Dimensión | Clippd | 18Birdies | Arccos | GolfGameBook | **Golfers+** |
|-----------|--------|-----------|--------|--------------|----------|
| Idioma | Inglés | Inglés | Inglés | Inglés/parcial | **Español nativo** |
| Precio | $25/mes | Freemium | $10/mes | Freemium | **$5/mes** |
| Hardware requerido | Garmin | Opcional | Sí ($300+) | No | **No** |
| Live scoring torneo | No | No | No | Sí | **Sí + GWI™** |
| Live scoring ronda libre | No | No | No | Sí | **Sí + GWI™** |
| IA/coaching | No | No | Básico | No | **tAIger+ (Claude)** |
| Coaching mental | No | No | No | No | **Sí (7 frameworks)** |
| Índice calculado | No | No | Sí | No | **Sí (USGA + CPI™)** |
| Mercado | Global | Global | Global | Global | **Chile/LatAm** |

- ¿El "océano azul" es el idioma, el precio, o la combinación datos+mente?
- ¿Hay jugadores locales chilenos o latinoamericanos no considerados?
- ¿Cuál es el riesgo de que 18Birdies o Arccos lancen español en 24 meses?

### 2.3 Posicionamiento y moat real
- La propuesta: "datos + mente, en español, a $5 USD". ¿Es creíble con 378 rondas y 0 sesiones de coaching?
- ¿El moat de tAIger+ es real o narrativa? ¿Qué lo haría genuinamente difícil de copiar en 3 años?

---

## BLOQUE 3 — MODELO DE NEGOCIO Y MONETIZACIÓN

### 3.1 Modelo freemium
- ¿Cuál es el muro de conversión correcto entre free y paid?
- El target del 15% conversión desde /demo: benchmarks SaaS deportivos son 2–8%. ¿Qué condiciones para 15%?
- ¿$4.990 CLP es correcto? Evaluar: Chile vs Argentina vs México.

### 3.2 Unit economics
- CAC por canal: torneo/ronda libre, referidos, WhatsApp communities, paid social
- LTV con retención 60% al mes 3
- Payback period y breakeven
- ¿Qué cohort de retención necesita para que LTV justifique paid acquisition?

### 3.3 Fuentes de ingresos adicionales
- **B2B clubes:** ¿cuánto pagaría un club por scoring? ¿Mensual, por torneo, anual?
- **Federaciones:** ¿deal con FGCh para ser sistema oficial scoring amateur?
- **Datos:** ¿qué data es valiosa para Titleist, TaylorMade o diseñadores de canchas?
- **Coaching marketplace:** ¿conectar pros locales con usuarios?

---

## BLOQUE 4 — CUSTOMER EXPERIENCE (CX) — ANÁLISIS PROFUNDO

*Bloque central. El más extenso y granular. Anclar en estado real.*

### 4.1 Mapa del journey — con datos reales

```
AWARENESS → CONSIDERACIÓN → PRIMERA SESIÓN → ACTIVACIÓN → HÁBITO → PAGO → ADVOCACY
```

Para cada etapa: JTBD real, pain points, momento de verdad, métrica.

### 4.2 El onboarding — ruta crítica al primer valor

El "aha moment":
> "Registré mi ronda y tAIger+ me dijo exactamente por qué pierdo strokes en los par 3 de 150m+"

Ruta: cuenta → historial importado (≥3 rondas) → CPI™ + Índice Golfers+ calculados → primera sesión tAIger+.

- ¿Cuántos pasos hay entre "llego a la app" y el aha moment? ¿Cuántos debería haber?
- ¿El wizard /importar está bien posicionado en el onboarding?
- ¿Los empty states están bien diseñados o el usuario ve vacío y se va?
- Benchmark: Whoop, Strava, Garmin Connect resuelven el cold start cómo?

### 4.3 Engagement loop

Golfista amateur Chile: 1–2 veces/semana en temporada, 0–1 en baja. La app debe tener valor entre rondas.

- ¿Cuál es el loop Hooked? (trigger → acción → recompensa → inversión)
- ¿Hay engagement entre rondas o solo se abre cuando va a jugar?
- ¿El Índice Golfers+ + CPI™ + nivel (Rookie→Golfer+) generan suficiente movimiento percibido?
- ¿El live scoring genera viralidad? ¿Cuántos espectadores de Prueba 1 se registraron?
- Invierno en Chile (junio–agosto): ¿estrategia?

### 4.4 Retención

- ¿Qué debe pasar en los primeros 7 días para que esté activo al mes 3?
- ¿Qué señales predicen churn? ¿Hay mecanismos de detección?
- Top 3 razones de abandono después de 30 días.
- Sesionalidad: invierno = menos rondas = menos datos = menos valor. ¿Estrategia?

### 4.5 La experiencia de tAIger+

Con 378 rondas, 7 pattern detectors, 0 sesiones usadas:
- ¿Qué calidad de coaching puede dar HOY?
- ¿El system prompt implementa correctamente Rotella/VISION54/ACSI-28/SMTQ/Broadie?
- ¿Qué haría que un usuario cite tAIger+ a sus amigos?
- Compara con coach humano real con mismos datos.
- Riesgo: ¿qué pasa si la API de Claude se cae durante un torneo?

---

## BLOQUE 5 — DISEÑO, UX/UI Y ENGAGEMENT VISUAL

### 5.1 Design system — coherencia real vs. intención

- ¿Hay tokens coherentes o valores hardcodeados dispersos?
- ¿La paleta (#070D18, #C4992A, #EDE9E4) comunica "premium latinoamericano"?
- ¿La jerarquía tipográfica es consistente en todas las pantallas?
- ¿ScoreSymbol.tsx y HoleColorBar.tsx se usan consistentemente?

### 5.2 El dashboard

- ¿Las 3 primeras cosas que ve el usuario son las correctas?
- ¿El CPI™ gauge genera emoción o es solo un número?
- El Índice Dual (Federación + Golfers+) + badge de nivel: ¿están bien posicionados en /perfil?
- Benchmark: Whoop recovery score — ¿el CPI™ puede tener esa gravitación?

### 5.3 El scorecard — producto más crítico en condiciones reales

Bajo sol, con guante, entre hoyos, con apuro.

- De los bugs del 24 Mar: ¿cuáles siguen? (Score invisible, solapamiento)
- ¿Cuántos taps para marcar un score? ¿Competitivo?
- ¿El fondo dark funciona bajo sol directo en OLED?
- ¿El toggle Scorecard/Leaderboard es UX correcta?

### 5.4 Microinteracciones y delight

- Celebraciones birdie/eagle/HIO implementadas. ¿Hay más oportunidades?
- ¿El producto "siente" rápido?
- 5 microinteracciones de alto impacto en NPS con bajo costo.

### 5.5 El leaderboard como motor de viralidad

- ¿El bug de página en blanco para espectadores sin auth está corregido?
- ¿El diseño es suficientemente atractivo para compartir en WhatsApp?
- ¿El GWI™ está explicado para alguien que llega por primera vez?
- ¿Los OG tags son correctos para preview en WhatsApp/iMessage?

### 5.6 Brand identity y voz

- ¿"Golfers+" comunica para golfista amateur latinoamericano?
- ¿"tAIger+" es claro o el "AI" genera fricción?
- ¿Hay voz de marca consistente o cada pantalla suena diferente?
- Instancias de "Handicap" en vez de "Índice" detectadas en /perfil.

---

## BLOQUE 6 — ESTRATEGIA DE GROWTH Y DISTRIBUCIÓN

### 6.1 Go-to-market
- ¿El canal "ronda como punto de entrada" está instrumentado?
- ¿Hay flywheel o crecimiento lineal?

### 6.2 Canales priorizados (bootstrapped, sin budget de marketing)
- Rondas libres como canal viral
- Torneos como canal (organizador lleva 20 jugadores + N espectadores)
- WhatsApp/community-led
- SEO orgánico: ¿volumen real para "app golf Chile"?
- Referidos: ¿hay mecanismo diseñado?
- CAC por canal y foco correcto para próximos 90 días.

### 6.3 Expansión LatAm
- ¿Qué hitos en Chile antes de expandir?
- ¿Qué cambia para Argentina y México?

---

## BLOQUE 7 — ORGANIZACIÓN, RIESGOS Y PRIORIDADES

### 7.1 Los 10 riesgos críticos

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| tAIger+ sin uso real (0 sesiones) — todo es teoría | | | |
| Founder único + Claude Code — bus factor 1 | | | |
| Schema drift (backlog P0 del 17 Mar aún parcialmente abierto) | | | |
| Scorecard con bugs pendientes en campo | | | |
| Churn por sesionalidad | | | |
| Competidor grande lanza español | | | |
| 47 canchas puede no ser suficiente para Chile (140+ campos en el país) | | | |
| RLS SQL pendiente de ejecutar en algunas tablas | | | |
| Sin Prueba 2 planificada | | | |
| [Identificar en análisis] | | | |

### 7.2 Capacidades faltantes
- ¿Qué capacidades faltan para 12 meses?
- ¿Qué requiere talento humano vs Claude Code?
- ¿Cuándo la primera contratación?

### 7.3 Roadmap de 90 días
- Sprints de 2 semanas, priorizado por impacto × esfuerzo
- Las 3 cosas que NO hacer (anti-roadmap)
- Criterio "listo para Prueba 2"
- Criterio "listo para buscar inversión"

---

## BLOQUE 8 — VISIÓN Y POTENCIAL ESTRATÉGICO

### 8.1 ¿Cuál es la empresa real?
- ¿App de golf o plataforma de rendimiento deportivo amateur que empieza en golf?
- ¿Replicable en tenis, running, padel?
- ¿Exit más probable?

### 8.2 Diferencial sostenible
- ¿Qué es más difícil de replicar en 3 años?
- ¿El dataset de golfistas latinoamericanos es moat real? ¿Cuántas rondas para ser defensible?
- ¿Fine-tuning propio vs Claude API? ¿Cuándo?

### 8.3 Hipótesis de inversión
- Narrativa de inversión en 3 oraciones
- Métricas para ser financiable
- ¿Pre-seed o seed? ¿Use of funds?

---

## ENTREGABLE FINAL — DIAGNÓSTICO EJECUTIVO

**"Top 10 de Insights y Recomendaciones"** jerarquizados por impacto en el negocio:

```
INSIGHT N: [Título]
Hallazgo:      [1-2 oraciones]
Diagnóstico:   [Por qué importa]
Recomendación: [Ejecutable por 1 persona + Claude Code]
Impacto KPI:   [Qué métrica mueve y cuánto]
Plazo:         [0–30 / 30–90 / 90+ días]
```

Cerrar con 1 párrafo:
**¿Vale la pena el camino? ¿Tiene Golfers+ lo necesario para convertirse en el estándar del golf amateur en español?**

---

## NOTAS PARA LA IA QUE EJECUTE ESTE PROMPT

- Leer los 8 archivos del Paso Obligatorio antes de responder. Todos existen en el repo.
- URL de producción: **https://golfersplus.vercel.app** (NO tu-golf.vercel.app)
- El founder (Juanjo) habla español latinoamericano. Análisis en español, riguroso pero sin jerga.
- Los bloques 4 y 5 (CX y diseño) deben ser los más extensos.
- tAIger+ tiene 0 sesiones reales — el coaching es 100% teórico hoy. Esto es un insight central.
- 378 rondas históricas es data real, no insuficiente. Evaluar qué se puede hacer con ella.
- El insight más valioso es el que señala la contradicción entre visión y realidad.

---

*Versión 3.0 — Santiago, Chile · 31 marzo 2026*
*Corregida y verificada contra producción por CTO (Claude Code)*
*23 errores de v2.0 corregidos, datos de producción actualizados, 6 sprints de trabajo incorporados*
