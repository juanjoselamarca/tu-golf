# Spec: Rediseño pestaña "Mi Golf"

**Fecha:** 2026-04-20
**Autor:** Claude (CTO) + Juanjo (PM)
**Estado:** Aprobado — listo para plan de implementación
**Ruta afectada:** `/dashboard` (bottom nav "Mi Golf")

---

## Contexto y problema

La pestaña "Mi Golf" actual (`src/app/dashboard/page.tsx`, 527 líneas) presenta 5 secciones en un único scroll con fondo oscuro. Problemas identificados:

1. **Inconsistencia visual**: fondo oscuro contra el resto de la app (Rondas, Perfil) que usa fondo claro. Corta la experiencia.
2. **Tema Garmin/luxury** (dorado `#c4992a` + Playfair Display serif) choca con el estilo minimalista del resto de la app.
3. **Duplicación con pestaña Rondas** del bottom nav: el feed de "Actividad reciente" repite data ya disponible en `/rondas`.
4. **Pobre explotación de data**: mostramos índice plano sin tendencia, sin contexto, sin insights. tAIger Coach (diferenciador del producto) como botón secundario.
5. **Sin separación de intenciones**: mezcla acción transaccional ("continuar ronda", "crear torneo") con reflexión analítica ("mi índice", "mis stats"), diluyendo ambas.
6. **Sin motivación de retorno diario**: entre rondas (que en golf pueden ser semanales), el dashboard no cambia. Riesgo de churn silencioso.

## Objetivo

Transformar "Mi Golf" en una experiencia dividida por intención del usuario — dos sub-pestañas con personalidad propia — consistente visualmente con el resto de la app y que resalte el valor diferenciador (tAIger Coach, índice Golfers+).

## No-objetivos

- No tocar el bottom nav global (sigue diciendo "Mi Golf").
- No tocar la pestaña Rondas ni la pestaña Perfil.
- No cambiar el schema de BD ni queries de Supabase más allá de lo necesario para `insight rotativo del día`.
- No agregar features nuevas no listadas en este spec (ej: rankings sociales, logros con badges) — queda para iteraciones posteriores.

---

## Arquitectura

### Sub-navegación

Dos tabs en la parte superior del viewport, estilo minimalista:

```
[ Competencia ]   Identidad •
─────────────
```

- **Underline animado** bajo el tab activo (no pills, no cards, sin fondo de color).
- **Badge dot `•`** junto al texto "Identidad" cuando hay un insight nuevo de tAIger no visto, o cuando el índice cambió desde la última visita. Fuerza descubrimiento de la segunda pestaña.
- **Default**: Competencia.
- **Persistencia**: el tab activo se recuerda en `localStorage` (key: `miGolfTab`), pero resetea a Competencia si pasan más de 24h sin visita.

### Componente route

- `/dashboard/page.tsx` queda como **Server Component** que carga data común.
- Se introduce un **Client Component** `<MiGolfTabs>` que maneja el tab switching.
- Cada tab es un componente separado: `<CompetenciaTab>` y `<IdentidadTab>` — Server Components donde sea posible, Client donde requiera interacción.

### Optimización de carga

- Data de Competencia carga en el initial render (crítica).
- Data de Identidad se lazy-carga al cambiar a ese tab la primera vez (Suspense + skeleton). Reduce el costo del render inicial (hoy son 11 queries paralelas).

---

## Pestaña 1 — Competencia

*"El golf que estoy jugando"*

### Hero contextual

Regla de prioridad explícita:

```
ronda_activa > torneo_hoy > torneo_en_7_dias > empty_state
```

Casos:

1. **Ronda activa** → card grande "Continuar ronda"
   - Nombre de la cancha
   - Hoyos jugados / total (ej: "Hoyo 7 de 18")
   - Score parcial vs par
   - CTA: "Continuar" → `/ronda-libre/[codigo]/score`
   - **Puede coexistir**: si además hay torneo hoy, aparece banner compacto debajo.

2. **Torneo en curso o próximos 7 días** (sin ronda activa)
   - Nombre del torneo + cancha + countdown ("Mañana", "en 3 días")
   - Mi estado (inscrito / organizador)
   - CTA: "Ver torneo" → `/torneo/[slug]`

3. **Empty state** (sin ronda activa, sin torneo inminente, con rondas pasadas)
   - Card "Empezar a jugar" con ilustración mínima
   - Sub-CTA pequeño: **"¿Qué dice tu coach esta semana?"** → `/coach` (visibilidad tAIger)

4. **Usuario nuevo** (0 rondas, 0 torneos, 0 historial)
   - Hero curado con 3 pasos visuales:
     1. "Juega tu primera ronda" → `/ronda-libre/nueva`
     2. "Conectá con tAIger" → `/coach`
     3. "Importá tu historial" → `/importar`
   - Sin otras secciones debajo (Competencia minimalista hasta primera acción).

### Acciones rápidas

3 píldoras horizontales (altura 44px, border-radius 22px):

1. **Nueva ronda libre** (dorado sólido, principal)
2. **Organizar torneo** (outline)
3. **Unirme con código** (outline)

### Mis torneos — solo si hay

Separado visualmente:

**Jugando en** (label gris mayúscula, tamaño 13px)
- Cards compactas con: nombre + cancha + estado (`open`, `in_progress`, `finished`)
- Último torneo finalizado como jugador: con posición final si existe

**Organizando** (label separador)
- Cards con nombre + estado + menú contextual (`TournamentCardMenu` reutilizado)
- Último torneo finalizado como organizador: compacto con resultado

Link al final: **"Ver todos mis torneos"** → `/perfil/historial?tab=torneos`. Crear ruta dedicada `/perfil/torneos` queda fuera de alcance de este spec.

### Últimas rondas — feed curado

3 rondas como máximo, formato una-línea:
- Cancha
- Score (gross + diferencial si existe)
- Fecha relativa ("hoy", "hace 2 días")
- Tap → detalle de la ronda

Link final: **"Ver todas mis rondas" → `/rondas`** (bottom nav Rondas — NO a `/perfil/historial`). Elimina duplicación.

### En Vivo

Widget `<EnVivoWidget>` (ya existe). Solo renderiza si hay rondas activas en la plataforma. Sin placeholder cuando no hay.

---

## Pestaña 2 — Identidad

*"El golfista que soy"*

### Hero de identidad

- Avatar circular (48px) + nombre del usuario en Playfair Display 28px (se mantiene serif solo aquí como acento premium).
- **Índice Golfers+ XL** (64px, Playfair Display, dorado `#c4992a`) con flecha de tendencia:
  - `▲ 0.3 en 30 días` (verde sutil)
  - `▼ 0.5 en 30 días` (rojo sutil — rojo = empeoró en golf)
  - `—` sin cambio
- Estado del índice (pill debajo):
  - `Activo` (índice calibrado)
  - `Calibrando X de 3` (con barra de progreso)
  - `Sin calibrar` (link a importar o jugar ronda)

**Empty state curado** si no tiene índice:
- Visualización del camino: 3 círculos con "Juega 3 rondas en canchas con slope/rating"
- No texto plano desalentador.

### tAIger Coach — card protagonista

Dos estados:

1. **Si usó tAIger al menos una vez**:
   - Card con el último insight. Si `taiger_sessions` tiene un campo `summary` o `insight_text`, se usa; de lo contrario se muestra "Último análisis completado · [fecha relativa]" con link a la sesión.
   - CTA "Ver sesión completa" → `/coach/sesion/[id]`
   - CTA secundario "Nueva sesión" → `/coach/sesion/nueva`

2. **Si nunca usó**:
   - Card "Tu coach con IA está listo"
   - Breve descripción (1 línea): "Analiza tus últimas rondas y encuentra patrones para mejorar"
   - CTA grande: "Hablar con tAIger" → `/coach`

Este card dispara el **badge dot** en el tab "Identidad" cuando hay una `taiger_sessions` más nueva que `last_tAIger_viewed_at` guardado en `localStorage` (key: `miGolfTaigerSeen`). Sin cambios de schema — cuando el usuario abre el tab Identidad se actualiza el timestamp local.

### Insight rotativo del día

Slot único que cambia por día (key: hash de fecha + user_id para estabilidad diaria).

Fuentes de insight, en orden de preferencia:

1. Stat real calculado de la data: "Tu mejor hoyo del mes fue el 7 en Sport Francés con -1"
2. Comparativa personal: "Llevas 5 rondas sin bogey en pares 3"
3. Benchmark comunidad (si hay data agregada): "Jugadores de tu nivel pegan drive a 220m promedio"
4. **Fallback**: sugerencia genérica de tAIger si no hay data suficiente.

Diseño: card clara con icono pequeño + texto 14-15px + link opcional "Ver más" si el insight tiene detalle.

### Stats de forma — grid 2x2

| Card 1: Promedio últimas 5 | Card 2: Mejor score |
| Card 3: Rondas jugadas (total) | Card 4: Cancha más jugada |

Cada card:
- Label gris pequeño (12px uppercase)
- Valor grande (20-24px, peso 700)
- Contexto opcional en 11px (ej: "a par +3", "en 12 rondas")

### Progreso & hitos

- Próximo hito con barra de progreso:
  - `X rondas más para tAIger+` (si `totalRounds < 5`)
  - `X rondas más para índice oficial` (si `rondasConDiferencial < 3`)
  - Si ya tiene todo: `CPI score` con tooltip explicativo
- Si CPI activo: mostrar valor + estado (`cpi_status`)

### Acceso a historial

Botón/link grande al final: **"Ver mi historial completo"** → `/perfil/historial` (página dedicada con stats avanzadas y filtros). No duplica el feed de 3 rondas de Competencia.

---

## Estilo visual

### Tokens

- **Fondo página**: blanco (`#ffffff` o `var(--bg-light)`). Consistente con Rondas.
- **Fondo cards**: `#f8f8f8` o blanco con sombra sutil (`box-shadow: 0 1px 3px rgba(0,0,0,0.06)`).
- **Border cards**: `#e5e5e5` (sutil, no marcado).
- **Texto primario**: `#1a1a1a`.
- **Texto secundario**: `#666666`.
- **Dorado acento**: `#c4992a` — usado en índice, CTAs primarios, tendencias positivas sutiles. **NUNCA como fondo pleno.**
- **Verde tendencia**: `#2d7a3e` (sutil, para mejoras).
- **Rojo tendencia**: `#c44040` (sutil, para empeoramientos).

### Tipografía

- **Playfair Display (serif)**: solo para números protagonistas — nombre del jugador en hero Identidad, índice Golfers+, score hero de ronda activa. No para labels ni texto corrido.
- **Inter / DM Sans (sans-serif, default del sistema)**: todo lo demás.

### Responsive

- Mobile-first. Max-width 640px centrado (mismo que hoy).
- Tabs superiores sticky top al hacer scroll.
- Grid de stats 2x2 se mantiene 2x2 en mobile (no colapsa a 1 col — es más scanneable).

---

## Requerimientos de data

### Ya disponibles (sin cambios)

- `tournaments` (como organizador)
- `players` → `tournaments` (como jugador)
- `rondas_libres`
- `historical_rounds` (con `diferencial`)
- `profiles` (`indice`, `indice_golfers`, `cpi_score`, `cpi_status`)
- `taiger_sessions`

### Nuevos cálculos (server-side)

1. **Tendencia del índice** (30 días):
   - Comparar `indice_golfers` actual vs el valor promedio de `diferencial` en los 30 días previos.
   - Si no hay suficiente data histórica, no mostrar flecha (solo valor plano).

2. **Stats de forma**:
   - Promedio últimas 5: `AVG(total_gross - par)` sobre últimas 5 `historical_rounds`.
   - Mejor score: `MIN(total_gross - par)` histórico.
   - Cancha más jugada: `GROUP BY course_name ORDER BY COUNT DESC LIMIT 1`.

3. **Insight rotativo** — función `selectDailyInsight(userId, date)`:
   - Determinística por día (hash de fecha + userId).
   - Orden de preferencia: stat real > comparativa personal > benchmark comunidad > fallback tAIger.
   - Cada fuente es una función que devuelve `Insight | null`. Se usa la primera no-null.

### Queries adicionales (al cargar Identidad)

- Últimos 5 `historical_rounds` para promedio.
- Agregado `course_name` count para cancha más jugada.
- `historical_rounds` agrupadas por mes para tendencia de índice (solo si el usuario tiene ≥ 5 rondas).

Estas queries **no se ejecutan en el render inicial** — se lazy-load al entrar a Identidad por primera vez en la sesión.

---

## Edge cases

| Escenario | Comportamiento |
|-----------|----------------|
| Usuario sin nada (0 rondas, 0 torneos) | Competencia: hero onboarding 3 pasos. Identidad: empty curado con camino al índice. |
| Usuario con rondas pero sin índice | Competencia normal. Identidad: hero "Calibrando X de 3" + progreso visual. |
| Usuario con ronda activa + torneo hoy | Hero "Continuar ronda" + banner compacto del torneo debajo. |
| Usuario con 2 rondas activas | Se muestra la más reciente (criterio: `updated_at` más nuevo). |
| tAIger sin sesiones | Card "Listo para empezar" con CTA, NO card vacía. |
| Sin conexión / queries fallan | Skeletons en lugar de errores. Si `profiles` falla, no hay hero de identidad — mostrar fallback neutral. |
| Data insight vacía | Fallback tAIger genérico: "Registrá una ronda para desbloquear insights personalizados." |

---

## Migración y compatibilidad

- La ruta `/dashboard` sigue existiendo — no se rompen bookmarks ni deep links.
- Los redirects internos existentes (`PostLoginRedirect`, `ExperiencePopupWrapper`) se preservan.
- El Server Component `DashboardPage` se refactoriza pero mantiene su signature.
- **No hay breaking changes** en otros componentes.

---

## Criterios de éxito

1. **Consistencia visual**: al navegar entre Rondas ↔ Mi Golf, la paleta y tipografía son coherentes (mismo fondo blanco, mismas cards).
2. **Velocidad de acceso**: ronda activa o torneo inminente visible en 1 tap desde cualquier parte de la app (bottom nav → Mi Golf → Hero).
3. **Descubrimiento de tAIger**: el badge dot en Identidad + sub-CTA en Competencia garantizan que un usuario nuevo vea tAIger en las primeras 3 visitas.
4. **Sin duplicación**: el feed de 3 rondas en Competencia linkea a la pestaña Rondas, no a otra ruta redundante.
5. **Empty state digno**: un usuario recién registrado ve algo útil y guiado, no una pantalla vacía con CTAs flotando.
6. **Tests pasan**: los 965 tests existentes siguen en verde. Se agregan tests para el tab switching y empty states.
7. **Build y tsc sin errores**: obligatorio antes de merge (CLAUDE.md).

---

## Fuera de alcance (iteraciones futuras)

- Rankings sociales / comparativa contra amigos.
- Sistema de logros con badges.
- Integración de clima / tee times por cancha.
- Stats avanzadas por hoyo (fairways hit, GIR, putts) — dependen de tracking más rico en scorecard.
- Página dedicada `/perfil/torneos` (si se requiere).
- Widgets en iOS/Android (home screen).
- Export de stats a PDF / compartir.

---

## Plan de implementación

A definirse con el skill `superpowers:writing-plans` después de aprobación de este spec. Pasos esperados:

1. Extraer componentes compartidos a `src/components/mi-golf/`.
2. Crear `<MiGolfTabs>` client component con localStorage persistence.
3. Refactor `/dashboard/page.tsx` a layout con tabs.
4. Construir `<CompetenciaTab>` (Server Component).
5. Construir `<IdentidadTab>` (lazy Server Component con Suspense).
6. Implementar `selectDailyInsight()` con fuentes priorizadas.
7. Ajustar queries: extraer las de Identidad a función separada.
8. Tests: tab switching, empty states, prioridad de hero.
9. Health check y verificación en producción.
