# Auditoría FTUE — Link → Organizar Torneo de Equipos

**Fecha:** 2026-05-22
**Auditor:** Claude (CTO) + 4 sub-agents
**Producción auditada:** https://golfersplus.vercel.app
**Cuenta test usada:** `juanjoselamarca+ftue1779498421@gmail.com` (a borrar al cierre)
**Branch:** `chore/audit-ftue-equipos-claude`

---

## 🔴 TL;DR — La feature ofrecida en landing NO está terminada

La hipótesis con la que arrancamos esta auditoría era: "el flujo desde link hasta torneo equipos tiene fricción de adquisición que podemos optimizar con copy, layout y onboarding". La realidad descubierta es más dura: **el wizard de equipos es una promesa rota end-to-end**.

Un usuario nuevo que recibe el link y quiere organizar un torneo de equipos:
1. Llega a la landing — bien presentada, claras CTAs.
2. Crea cuenta en ~3 pasos sin verificación bloqueante — OK.
3. Cae en `/dashboard`, ve "Organizar Torneo" — OK.
4. Entra al editor `/organizador/nuevo`, selecciona formato "Best Ball" o "Scramble" — OK.
5. Submita el torneo — **el `team_config` se pierde en el INSERT**, no existe tabla `tournament_teams`, y al llegar a `/organizador/<slug>/jugadores` ve UI de scoring individual. La modalidad equipos no existe end-to-end.

Sumado: **formatos chilenos faltantes** (Match Play x Bandera, Bola Pinta, Greensome, Texas Scramble), **PostHog instalado pero bloqueado por CSP** (analytics no captura nada en prod), **stats vacíos** en landing ("0+ canchas, 0+ hoyos") que daña credibilidad inmediata.

**Recomendación general:** congelar mejoras cosméticas del funnel hasta cerrar la promesa rota. La directiva CERO TOLERANCIA A FALLOS aplica directamente — lanzar la app a clubes chilenos con esta feature rota es exactamente el escenario que la directiva prohibe.

---

## Scorecard por etapa (0-10)

| # | Etapa | Score | Estado | Top fricción |
|---|---|---|---|---|
| 1 | Link → Landing | **6/10** | ⚠️ | Stats "0+ canchas/hoyos/rondas" daña credibilidad. Perf 3.5s mobile. PostHog CSP bloqueado. |
| 2 | Landing → Signup | **8/10** | ✅ | Múltiples CTAs claros, sin tarjeta, sin verificación bloqueante. |
| 3 | Onboarding (perfil) | **5/10** | ⚠️ | Sin tour. Vocabulario denso (CPI, slope/rating, tAIger+). "Personalizar ahora/Más tarde" sin contexto. |
| 4 | Home → Organizar | **7/10** | ✅ | Card "Organizar Torneo" visible. 3 entradas redundantes (card + quick action + duplicado en menú). |
| 5 | Wizard step 1 | **6/10** | ⚠️ | Único botón "+ Empezar desde cero". Sin plantillas pre-armadas. Asume que el usuario sabe configurar todo desde cero. |
| 6 | Wizard editor (modalidad) | **5/10** | ⚠️ | Single-page de 11 secciones scrolleables (no wizard). Solo 3 formatos equipo (Best Ball, Scramble, Foursome). Faltan los chilenos. |
| 7 | **Asignación jugadores a equipos** | **0/10** | 🔴 **NO EXISTE** | UI completamente ausente. `team_config` se pierde en INSERT. |
| 8 | Invitar + confirmación | **n/a** | ⏸️ | No alcanzable: bloqueado por #7. |

**Score global ponderado:** **4.6/10** (penalizado fuerte por la etapa rota).

---

## 🎯 Top 10 fixes priorizados (matriz ICE = Impact × Confidence × Ease)

Escala 1-10 cada eje. Score = I × C × E / 100.

| # | Fix | Impact | Confidence | Ease | Score | Etapa | Esfuerzo |
|---|---|---|---|---|---|---|---|
| 1 | **🔴 Arreglar wizard equipos E2E**: incluir `team_config` en INSERT, crear tabla `tournament_teams`, UI de asignación en JugadoresPanel | 10 | 10 | 4 | **4.0** | 7 | 3-5 días |
| 2 | **🔴 Stats landing reales o ocultar "0+"**: si no hay datos, no mostrar widget de stats vacíos | 8 | 10 | 9 | **7.2** | 1 | 1h |
| 3 | **🔴 CSP fix PostHog**: agregar `us-assets.i.posthog.com` a `script-src` y `connect-src` para que el funnel ya instalado funcione | 9 | 10 | 9 | **8.1** | 1, 3 | 30 min |
| 4 | **🟠 Plantillas de torneo pre-armadas**: además de "Empezar desde cero", ofrecer "Torneo Equipos Scramble - 18 hoyos", "Match Play Individual", etc. con valores por defecto pre-cargados | 8 | 8 | 6 | **3.8** | 5 | 2 días |
| 5 | **🟠 Glosario inline en dashboard**: tooltips sobre CPI, tAIger+, slope/rating, "Calibración del índice" para usuarios nuevos | 7 | 8 | 8 | **4.5** | 3 | 1 día |
| 6 | **🟠 31 eventos PostHog**: instrumentar el funnel completo según `funnel-tracking-plan.md` para medir drop-off real | 9 | 9 | 6 | **4.9** | todas | 2 días |
| 7 | **🟠 Formatos chilenos**: Match Play x Bandera, Bola Pinta, Greensome, Texas Scramble | 7 | 9 | 5 | **3.2** | 6 | 3 días |
| 8 | **🟡 Inscripción por código de 6 dígitos** (al estilo V-Par): para que un jugador invitado se sume sin necesidad de cuenta pre-creada | 8 | 7 | 6 | **3.4** | invitar | 2 días |
| 9 | **🟡 Onboarding tour**: 3-pantalla tour post-signup que muestre Organizar Torneo + Ronda Libre + Mi Golf | 6 | 7 | 7 | **2.9** | 3 | 2 días |
| 10 | **🟡 "Liga de Golf - Próximamente"** ocultar o mover a footer (ocupa espacio sin valor en dashboard) | 4 | 9 | 10 | **3.6** | 4 | 15 min |

**Total esfuerzo top 10:** ~18-22 días de dev concentrado.

---

## Quick wins (<1 día) — hacer YA

1. **#10** Ocultar "Liga de Golf - Próximamente" del dashboard (15 min)
2. **#3** Fix CSP PostHog (30 min) → habilita medición inmediata
3. **#2** Stats landing reales o widget oculto (1 hora)
4. Eliminar errores 401 silenciosos en consola (1-2 hora, son intentos de auth check sin sesión que ensucian DevTools)

Estos 4 sumados son **<1 día de trabajo** y suben el score global de ~4.6 a ~5.5.

## Investments (>3 días, alto ROI)

1. **#1 Wizard equipos E2E** — la inversión más alta y la más necesaria. Sin esto, lo demás es maquillaje.
2. **#6 PostHog instrumentado** — habilita medición continua, valida los demás cambios.
3. **#4 Plantillas pre-armadas** — reduce time-to-first-tournament de ~10 min a ~2 min.

---

## Hallazgos por fase

### FASE 1 — Walkthrough cinematográfico

**Captures:** `walkthrough-screenshots/` (15 PNGs, mobile 375x812)

**Pantallas recorridas:**
- `01-landing-mobile.png` + annotated
- `02-register-mobile.png` + annotated, `03-register-filled.png`
- `05-login-page.png`, `05-login-filled.png`, `06-post-login-annotated.png`
- `07-dashboard.png`
- `08-wizard-step1-annotated.png` (`/organizador/nuevo` con "+ Empezar desde cero")

**Performance medida (mobile, primera carga):**
- Landing: TCP 568ms, SSL 348ms, domReady 1.87s, load total **3.48s**
- /register: load total 3.35s
- /dashboard: load total ~4s estimado

Para usuarios chilenos en 4G/5G, 3.5s es marginal. Para usuarios en WiFi de club lento, puede pasar a 6-8s. Worth optimizar.

**Bugs cosméticos detectados:**
- Stats vacíos "0+ canchas / 0+ hoyos / 0+ rondas" en landing (línea ~9 del texto extraído)
- Errores 401 repetidos en consola pre-login (intentos de fetch de recursos protegidos sin auth)
- Errores CSP PostHog en TODAS las páginas (4 por carga)
- Warning Unsplash image preloaded pero no usada

### FASE 2 — Cognitive walkthrough estructurado

Las 4 preguntas formales (¿sabe qué hacer? ¿ve dónde? ¿entiende feedback? ¿avanza con confianza?) aplicadas a cada pantalla capturada:

| Pantalla | Sabe qué hacer | Ve dónde | Entiende feedback | Avanza con confianza |
|---|---|---|---|---|
| Landing | ✅ "Crear cuenta gratis" claro | ✅ 4 CTAs visibles | n/a | ⚠️ Stats "0+" siembran duda |
| /register | ✅ Form simple, OAuth y email | ⚠️ Toggle ▾ "Registro email/contraseña" puede confundir si campos parecen ocultos | ✅ Botón "Creando cuenta..." con spinner | ✅ Sin verificación bloqueante |
| /login | ⚠️ Link "Olvidaste tu contraseña?" visualmente cerca del botón submit, riesgo de click erróneo (lo hice yo en el walkthrough) | ⚠️ | ✅ Spinner "Ingresando..." | ⚠️ Sin feedback si email no existe |
| /dashboard post-signup | ⚠️ Vocabulario denso (CPI, tAIger+, slope/rating) | ✅ Card "Organizar Torneo" muy visible | ✅ "Hola, [nombre]" + "Sin torneos en curso" | ⚠️ "Personalizar ahora/Más tarde" sin contexto |
| /organizador/nuevo | ✅ "+ Empezar desde cero" es claro | ✅ Único botón | n/a | ⚠️ Sugiere "voy a tener que llenar todo desde cero" |
| Editor torneo (sección equipos) | ⚠️ 11 secciones scrolleables, no wizard | ⚠️ Sin barra de progreso | ⚠️ Autosave silencioso a draft JSONB | ⚠️ Selecciona "Best Ball" pero el resultado no refleja modo equipos |

### FASE 3 — Funnel instrumentado

**Output completo:** `funnel-tracking-plan.md` (~2000 palabras)

**Highlights:**
- PostHog YA instalado (v1.364.2) en `src/app/layout.tsx:98` con autocapture + pageviews + captureException.
- **CERO eventos custom** en todo `src/` (grep confirmado).
- **31 eventos diseñados**: 9 auth, 9 wizard organizador (incluye `org_wizard_format_selected` con `is_team_format`), 6 invite/join, 7 transversales.
- **Recomendación:** PostHog único (no agregar Vercel Analytics — duplicaría pageviews y partiría el funnel).
- **3 sorpresas del código:**
  - `dashboard/page.tsx:27` recibe `welcome=true` query pero hace `void params` y nunca dispara onboarding/identify → bug latente.
  - `unirse/page.tsx:125` hace INSERT directo cliente que depende de RLS; error `42501` se traga como toast silencioso → drop-off invisible.
  - `/admin/analytics` tiene un "funnel" pero construido sobre queries Supabase (registered → firstRound → ...), no eventos comportamentales — por eso no detecta abandono intra-wizard hoy.

### FASE 4 — Protocolo test con usuarios reales

**Output completo:** `protocolos/test-usuarios-ftue.md` (~14-16 págs A4, listo para imprimir)

**Highlights:**
- 40-45 min por sesión, 3-5 participantes recomendados.
- Incentivo: **sleeve Pro V1 ($25.000 CLP × 5 = $125.000 CLP)** — universal en golf, no se siente "pago".
- Dependencias técnicas: **scrcpy** (Android), **LonelyScreen/ApowerMirror** (iPhone+Windows), FigJam/Miro para affinity mapping.
- Tarea principal: "Organizá un torneo de equipos de 8 personas para el próximo sábado en tu club".
- Métricas: time-on-task, errores críticos, help points, **SUS score** (10 preguntas), **SEQ** (single ease question) por sub-tarea.
- Confianza del autor del protocolo: **8/10** corre esta semana sin más trabajo (10 min dry-run con scrcpy lo sube a 9.5/10).

**Recomendación:** correr en cuanto el wizard equipos esté fixed. Antes no tiene sentido — los participantes se van a frustrar al final y el aprendizaje será sobre el bug, no sobre la UX general.

### FASE 5 — Benchmark The Grint + V-Par

**Output completo:** `benchmark-grint-vpar.md` (~2750 palabras)

**Highlights:**
- **V-Par** tiene mejor flujo organizar-equipos por su primitiva **código de torneo de 6 dígitos** (cero fricción social).
- **The Grint** mejor self-service inmediato (4-5 pasos, todos los formatos en free tier) pero arrastra "solo Grinters pueden ingresar scores".
- **Time-to-first-tournament:** Grint 5-8 min · V-Par 10 min self-service o **días** via Tournament Service.
- **Diferenciadores:**
  - Grint = red social golfista + integración handicap GHIN/USGA + Tours multi-evento.
  - V-Par = live leaderboards estilo Pro-Am con TV display + enterprise sales-led.
- **Sorpresa explotable:** V-Par cobra Premium (£49.99/año) por "Guest Profiles" (agregar jugadores sin email) — exactamente el caso chileno típico (torneo 60 jugadores, 50 sin app). **Cobrar por eso es un error estratégico que Golfers+ debe NO cobrar.**
- **Confianza del benchmark:** 7/10 (VPAR Zendesk bloqueó scraping, algunos steps inferidos de SERP).

### FASE 6 — Wizard equipos (auditoría de código)

**Output completo:** `wizard-equipos-code-walkthrough.md` (~2500 palabras)

**Hallazgos críticos:**
- 🔴 **`team_config` se pierde en INSERT** (`create-tournament/route.ts:75-96` nunca lo lee). El usuario selecciona Best Ball/Scramble/Foursome pero la modalidad se guarda solo en draft JSONB, no en `tournaments`.
- 🔴 **No existe tabla `tournament_teams`**. Solo `ronda_equipos` que vincula a `rondas_libres` (otro flujo). El submit del torneo no crea estructura de equipos.
- 🔴 **JugadoresPanel.tsx no tiene la palabra "team/equipo"** — UI de asignación inexistente.
- ⚠️ Solo 3 formatos: Best Ball, Scramble, Foursome (chips en `ComoJueganSection.tsx:18-25`). Match Play está como individual.
- ⚠️ Es un editor single-page, no wizard real — 11 secciones scrolleables + autosave a draft JSONB cada cambio.
- ⚠️ ~9-10 clicks mínimos a torneo creado (con defaults que autocompletan `team_config` sin requerir input).

**Resolución de contradicción de memoria** (correcta hoy 2026-05-22): la memoria que decía "UI de Asignación de Equipos SÍ Está Implementada" está obsoleta. Confundía configuración (existe en `EquiposSection`) con asignación (no existe). Memoria actualizada — ver `project_wizard_equipos_roto.md`.

---

## Próximos pasos accionables (orden estricto)

1. **HOY** — Quick wins (#10 + #3 + #2 ocultar stats): 1.5 horas. Visible inmediato en prod.
2. **Esta semana** — #1 Wizard equipos E2E: el bloqueante de todo. Sin esto el resto es maquillaje.
3. **Esta semana** — #6 Instrumentar 31 eventos PostHog. Habilita medir el efecto de los demás cambios.
4. **Próxima semana** — #4 Plantillas pre-armadas + #5 Glosario inline + #7 Formatos chilenos.
5. **Cuando #1 esté fixed** — Correr #4 (test con usuarios reales) según `protocolos/test-usuarios-ftue.md`. **Antes no tiene sentido.**
6. **Mes siguiente** — #8 Inscripción por código + #9 Onboarding tour, validados por el funnel ya instrumentado.

---

## Apéndices

### Documentos generados en esta auditoría

- `2026-05-22-ftue-organizar-torneo-equipos.md` — **este doc** (síntesis ejecutiva)
- `walkthrough-screenshots/` — 15 PNGs del flujo end-to-end (mobile 375x812)
- `funnel-tracking-plan.md` — tracking plan con 31 eventos, archivo:línea, stack recomendado
- `protocolos/test-usuarios-ftue.md` — protocolo think-aloud listo para imprimir
- `benchmark-grint-vpar.md` — competitive analysis Grint + V-Par
- `wizard-equipos-code-walkthrough.md` — auditoría técnica del wizard

### Cuenta test creada

- email: `juanjoselamarca+ftue1779498421@gmail.com`
- user id Supabase: `670e4bfc-9a1b-492c-a43e-feeb852d32e9`
- **Action item:** borrar al cierre con `auth.admin.deleteUser(user_id)` para no contaminar métricas de signup.

### Cómo extender esta auditoría

- Cuando el wizard equipos esté fixed, repetir el walkthrough desde step 6 (asignación + invitar + confirmación) para completar el scorecard.
- Cuando haya >100 usuarios reales, el funnel PostHog dará drop-off cuantitativo que reemplaza la estimación cualitativa de este doc.
- Cuando se corran los 3-5 tests con usuarios reales, agregar sección "Hallazgos test usuarios" con verbatim quotes y prioridad re-ordenada por evidencia humana.

### Limitaciones de esta auditoría

- El walkthrough no llegó a wizard steps 2-N (asignación, invitar, confirmación) porque el browser headless se cayó en Windows + worktree. **Mitigación:** auditoría de código por sub-agent dedicado (FASE 6).
- Benchmark Grint+V-Par a 7/10 de confianza (VPAR Zendesk bloqueó scraping; algunos steps inferidos).
- No testeé el flujo Google OAuth (requiere setup adicional fuera de scope).
- No medí Core Web Vitals reales con Lighthouse (worth siguiente sesión con `/benchmark` skill).
