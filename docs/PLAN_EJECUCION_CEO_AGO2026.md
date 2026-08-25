# Plan de Ejecución CEO — Golfers+ (agosto 2026)

**Origen:** Auditoría CEO (67 problemas) + Entrevista a Juanjo (12 rondas) + Recorrido destructivo (42 issues)
**Principio rector:** Todo tiene que funcionar. Nada roto. Standard Augusta/Garmin.
**Presión de tiempo:** Ninguna. "Lo que haga falta." Pero cada fase tiene un gate claro.

---

## Estructura: 4 fases secuenciales + seguridad pre-piloto

```
FASE 1: Cero Dead-Ends (cada botón funciona, cada ruta carga)
   ↓ gate: Juanjo recorre la app y no encuentra nada roto
FASE 2: Flujo Completo — Ronda Libre (de punta a punta sin fricción)
   ↓ gate: 3 amigos golfistas scorean una ronda cada uno sin ayuda
FASE 3: Flujo Completo — Torneos (crear, inscribir, scorear, resultados)
   ↓ gate: torneo simulado con 10+ jugadores funciona perfecto
FASE 4: Coach + Diseño Premium (impresionar desde la primera tarjeta)
   ↓ gate: Juanjo muestra la app al encargado de torneos del club

PRE-PILOTO: Seguridad (antes de abrir a usuarios externos)
   → secrets rotados, rate limiting persistente, backup formalizado
```

---

## FASE 1 — Cero Dead-Ends (3-5 días)

Cada botón hace algo. Cada ruta carga. Nada dice "Cargando..." eternamente.

### 1A. Dead-ends (los 6 P0)

| # | Issue | Tarea | Esfuerzo |
|---|-------|-------|----------|
| 1.1 | "Unirme con código" → 404 | Crear `/torneo/unirme/page.tsx` con input de código → redirect | 2h |
| 1.2 | Match Play bracket click → console.log | Implementar modal/expansión de scorecard al click | 4h |
| 1.3 | Leaderboard sirve datos DEMO sin label | Agregar badge "DEMOSTRACIÓN" prominente + link a torneos reales | 1h |
| 1.4 | Historial no muestra si ronda cuenta para índice | Badge por ronda: "Cuenta para índice" / "No cuenta" + razón | 4h |
| 1.5 | Historial: switch manual incluir/excluir ronda | Toggle on/off por ronda + recalcular índice | 6h |
| 1.6 | console.error en producción (4 ubicaciones) | Reemplazar con captureError() | 1h |

### 1B. Scorer P0

| # | Issue | Tarea | Esfuerzo |
|---|-------|-------|----------|
| 1.7 | Insert historical_rounds sin verificar error | Wrap en try/catch + toast de error + retry | 2h |
| 1.8 | alert() nativo en flujo de descarte | Reemplazar con addToast() | 30min |
| 1.9 | "Descartar ronda" es cambio de texto, no modal | Modal de confirmación con "Cancelar" / "Sí, descartar" | 1h |

### 1C. Formatos — bugs funcionales

| # | Issue | Tarea | Esfuerzo |
|---|-------|-------|----------|
| 1.10 | BestBallTeamCard: strokes undefined → 0 | Agregar fallback chain | 30min |
| 1.11 | Scramble vs Best Ball sin diferencia visual | Label "Score del equipo" vs "Score de cada jugador" | 1h |
| 1.12 | Stableford permite gross (inconsistente con Chile) | Restringir a neto en FORMAT_META + documentar | 1h |
| 1.13 | Match Play resultado no se guarda en historial | Agregar campo match_result a historical_rounds | 2h |
| 1.14 | Equipo: finalización pierde contexto team | Agregar team_id + team_result a historical_rounds | 3h |
| 1.15 | Sin explicación de reglas por formato al crear ronda | Card con resumen de reglas del formato elegido | 2h |

**Gate:** Juanjo abre la app en su teléfono. Toca CADA botón del menú, CADA opción del play sheet, CADA formato. Si algo no funciona o confunde → se arregla antes de avanzar.

---

## FASE 2 — Flujo Completo: Ronda Libre (5-7 días)

Un golfista puede scorear una ronda completa sin fricción, desde que abre la app hasta que comparte el resultado.

### 2A. Onboarding (el 85% que rebota)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 2.1 | Onboarding 3 pantallas post-registro: ¿Handicap? → ¿Club habitual? → "Scorea tu primera ronda" | 3d |
| 2.2 | Dashboard con estado "nuevo usuario" muestra guía, no vacío | incluido en 2.1 |

### 2B. Setup de ronda — los pain points de Juanjo

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 2.3 | "Repetir última ronda" — botón 1-tap que precarga todo | 4h |
| 2.4 | Conectar jugadores con cuenta existente — buscar por nombre/email | 4h |
| 2.5 | Auto-completar índice y tee de jugadores conectados | 2h |
| 2.6 | Desplegable de canchas recientes: más rápido, touch-friendly | 3h |

### 2C. Post-ronda — cerrar el loop

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 2.7 | Auto-trigger coach post-ronda + push notification "tu coach analizó tu ronda" | 3d |
| 2.8 | Toast de confirmación con handicap actualizado: "Tu índice bajó de 15.2 a 14.8" | 2h |
| 2.9 | Share card con CTA "Crea tu cuenta gratis" para el que recibe | 2h |

### 2D. Historial — lo que Juanjo pidió

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 2.10 | Filtro por cancha, fecha, formato | 4h |
| 2.11 | Gráfico de progresión del handicap en el tiempo | 4h |

**Gate:** 3 amigos golfistas de Juanjo (no nosotros) crean cuenta, scorean una ronda cada uno, reciben notificación del coach, comparten por WhatsApp. Si 2 de 3 dicen "volvería a usarla" → pasa.

---

## FASE 3 — Flujo Completo: Torneos (7-10 días)

Un organizador puede crear un torneo, invitar jugadores, correr el scoring live, y compartir resultados.

### 3A. Crear torneo

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 3.1 | "Mis Torneos" en la navegación principal | 2h |
| 3.2 | Wizard de creación guarda borrador automático (auto-save) | 4h |
| 3.3 | Formatos pre-cargados: "Torneo Stroke Play 18h" / "Scramble 4 equipos" / etc. | 3h |

### 3B. Inscripción y distribución

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 3.4 | QR code para distribución en campo (imprimir/pegar en pizarra) | 3h |
| 3.5 | Guest scoring — scorear sin cuenta → "¿Guardar stats?" al final | 5d |
| 3.6 | Invitación masiva — pegar lista de nombres/emails | 4h |
| 3.7 | Botón "Unirme" visible en página de torneo para invitados | 2h |
| 3.8 | Join simplificado: ver info del torneo ANTES de login | 2h |

### 3C. Live scoring y resultados

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 3.9 | Leaderboard real (no demo) accesible desde nav principal | 2h |
| 3.10 | Stableford: display muestra "34 puntos" no solo golpes | 2h |
| 3.11 | Match Play: conceder hoyo + estado dormie | 4h |
| 3.12 | Foursome: toggle invertir orden en UI | 2h |
| 3.13 | Foursome: scorecard indica quién pegó cada hoyo (A/B) | 2h |

### 3D. Post-torneo

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 3.14 | Share card de resultados del torneo (leaderboard como imagen) | 3h |
| 3.15 | Auto-rebalanceo de grupos si jugador se retira | 3h |

**Gate:** Torneo simulado con 10+ jugadores (amigos de Juanjo). Creación → inscripción → scoring live → resultados → share. Si funciona sin intervención manual → pasa.

---

## FASE 4 — Coach + Diseño Premium (5-7 días)

El coach impresiona desde la primera tarjeta. La app se ve uniforme y premium.

### 4A. Coach que impresione

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 4.1 | Coach se activa SIN rondas previas — sesión de onboarding con preguntas | 3d |
| 4.2 | Con 1-2 tarjetas importadas: insight no-obvio + game plan hoyo a hoyo | 2d |
| 4.3 | Costo psicológico calculado sobre TODOS los patrones, no solo post_bogey_spiral | 1d |

### 4B. Diseño uniforme

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 4.4 | Migrar colores hardcodeados a CSS tokens en los ~20 componentes del flujo principal | 2d |
| 4.5 | Loading states uniformes: skeleton en todas las rutas (no "Cargando..." texto) | 1d |
| 4.6 | Botones disabled con feedback visual uniforme (opacity + cursor) | 4h |
| 4.7 | Touch targets del scorer a 48px mínimo | 2h |
| 4.8 | Navegación: renombrar secciones (COMUNIDAD/MI JUEGO/LABORATORIO → algo intuitivo) | 2h |

**Gate:** Juanjo muestra la app al encargado de torneos de su club. La reacción define si avanzamos a piloto real o iteramos.

---

## LO QUE NO ENTRA EN ESTE PLAN

| Tema | Por qué no | Cuándo |
|------|-----------|--------|
| Seguridad (secrets, rate limiting, backups) | Repo privado, 0 usuarios externos | Pre-piloto (antes de abrir al club) |
| Cerebro V3 (olas 4-7) | Sin usuarios para entrenar ML | Post-piloto club |
| Refactor archivos >1000 LOC | No mata la experiencia del usuario | Se aplica con "el que toca, ordena" |
| 613 colores hardcodeados restantes | Solo arreglamos los del flujo principal | Fase 4 cubre los ~20 críticos |
| 164 aria-labels (WCAG completo) | Importante pero no deal-breaker para el piloto | Post-piloto |
| Paywall / monetización | Sin usuarios no hay revenue | Post 50 usuarios activos |
| GPS / Apple Watch | Todos los competidores lo tienen — no es diferenciador | Post-tracción |
| PWA offline completo | Scoring offline ya funciona (localStorage) | Post-piloto |
| Sync automática con FedeGolf | Requiere acuerdo con la federación | Post-piloto |
| Email transaccional (Resend) | Depende de acción de Juanjo | Cuando Juanjo configure |

---

## RESUMEN DE ESFUERZO

| Fase | Días estimados | Gate |
|------|---------------|------|
| 1 — Cero Dead-Ends | 3-5 | Juanjo toca cada botón, nada roto |
| 2 — Ronda Libre E2E | 5-7 | 3 amigos scorean sin ayuda |
| 3 — Torneos E2E | 7-10 | Torneo simulado 10+ jugadores |
| 4 — Coach + Diseño | 5-7 | Juanjo muestra al encargado del club |
| Pre-piloto — Seguridad | 1-2 | Secrets rotados, rate limiting, backup |
| **Total** | **~19-31 días** | |

No son 19-31 días calendario — son días de trabajo. Con sesiones de ~4-6h, estamos hablando de **4-6 semanas** hasta estar listos para el piloto real en el club.

---

## MÉTODO DE TRABAJO

- **Claude ejecuta todo** — commits, PRs, deploys, SQL, testing
- **Si hay duda de producto** → entrevista con AskUserQuestion (no asumir)
- **Si hay duda técnica** → Claude decide (rol CTO)
- **Cada fase termina con su gate** — no se avanza sin pasar
- **Pre-push obligatorio** en cada commit: tsc + tests + build
- **Code review** en PRs >100 LOC

---

**Plan escrito:** 19 agosto 2026
**Autor:** Claude (CEO/CTO) con input directo de Juanjo
**Próxima revisión:** al cerrar cada fase
