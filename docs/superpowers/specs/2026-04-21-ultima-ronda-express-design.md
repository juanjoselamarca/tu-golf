# Última Ronda Express — Design Spec

**Fecha:** 21 Abr 2026
**Autor:** Head of UX/UI + CTO (Claude)
**Estado:** Spec aprobado por Juanjo (PM) — pendiente implementación vía `writing-plans`.

## Goal (1 línea)

Hacer que el usuario vea y comparta su última ronda finalizada con **0-1 clicks** al abrir la app en el restaurant del club, y que pueda escanear rápidamente las mejores y peores jugadas sin navegar menús.

## User jobs priorizados por el PM (en conversación con usuarios reales)

| # | Job | Contexto | Resuelto por |
|---|-----|---------|-------------|
| 1 | Revisar la última ronda ULTRA rápido | Restaurant del club, amigos con cerveza, teléfono pasando de mano en mano | **UltimaRondaHero** (nuevo, 4º estado del hero contextual) |
| 2 | Ver el desempeño: buenas jugadas y errores | Mismo contexto, inmediatamente después de abrir la ronda | **RoundHighlights** (nuevo, en espectador finalizado) |
| 3 | Obtener scores hoyo-a-hoyo para transcribir al portal de Fedegolf y actualizar WHS | En casa, computadora o celular, entrando al portal oficial | **Scorecard component existente** (sin cambios) |
| 4 | Compartir el resultado (imagen) | WhatsApp / Instagram / grupos de golf | **Share card existente** (`compartirLeaderboard`) |

Jobs #3 y #4 se consideran **ya resueltos por la app actual**. Este sprint entrega solo jobs #1 y #2.

## Scope explícito

### DENTRO de scope
- Un nuevo componente `UltimaRondaHero` que se renderiza como 4º estado del hero contextual de `CompetenciaTab` cuando el usuario tiene una ronda finalizada hoy.
- Un nuevo componente `RoundHighlights` que se renderiza en `/ronda-libre/[codigo]` cuando `isFinished === true`, arriba del leaderboard.
- Dos módulos helpers puros (con tests unitarios): `ultima-ronda.ts` para decidir cuándo mostrar el hero, `round-highlights.ts` para computar highlights del jugador autenticado.

### FUERA de scope (decisiones explícitas)
- ❌ Nueva ruta `/mis-rondas` o `/ultima-ronda`
- ❌ Modificaciones a `/perfil/historial`
- ❌ Modificaciones a Mi Golf `IdentidadTab`
- ❌ Filtros por formato / cancha
- ❌ Búsqueda textual
- ❌ Timeline visual
- ❌ Export a PDF o imagen de "Tarjeta para Federación" — validado con PM que Fedegolf usa portal online donde usuario transcribe manualmente.
- ❌ Migración de schema para agregar `finalized_at` timestamp (ver Tradeoff 2 abajo).
- ❌ Modificaciones al Scorecard component existente
- ❌ Modificaciones al share card existente
- ❌ Modificaciones a archivos protegidos (`Navbar.tsx`, `layout.tsx`, `middleware.ts`, `lib/supabase.ts`)

## Arquitectura

### Data flow

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard page.tsx (Server Component)                       │
│    - Ya consulta rondas_libres.estado='finalizada' + fecha   │
│    - Ya arma prop `finishedRondas` para CompetenciaTab       │
│    - [NUEVO] Pasa `fechaHoy` (Santiago TZ) como prop a       │
│       CompetenciaTab (ya existe, solo confirmar)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  CompetenciaTab (Client Component, v2 recién shippeada)      │
│    - Hero contextual con 3 estados actuales                  │
│    - [NUEVO] Llama a getUltimaRondaReciente(finishedRondas,  │
│        fechaHoy) para decidir si renderiza el 4º estado      │
│    - Si retorna ronda → <UltimaRondaHero ronda={...} />      │
│    - Si retorna null → hero actual sin cambios               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (click "Ver mi ronda")
┌─────────────────────────────────────────────────────────────┐
│  /ronda-libre/[codigo] (Client Component)                    │
│    - Espectador con isFinished=true                          │
│    - [NUEVO] Si isFinished: llama a computeHighlights(scores,│
│        parMap) para el jugador autenticado                    │
│    - Renderiza <RoundHighlights data={...} /> arriba del     │
│        leaderboard existente                                 │
│    - Scorecard expandible existente cubre Job #3             │
│    - Botón "Compartir resultados" existente cubre Job #4     │
└─────────────────────────────────────────────────────────────┘
```

### Componentes y responsabilidades

#### 1. `src/lib/mi-golf/ultima-ronda.ts` (helper puro + test)

```ts
export interface RondaResumen {
  id: string
  codigo: string
  course_name: string
  fecha: string  // ISO date "YYYY-MM-DD"
  estado: string
  total_gross: number | null
  vsPar: number | null
}

/**
 * Retorna la ronda "última reciente" si el usuario tiene al menos
 * una ronda finalizada con fecha === fechaHoy (Santiago TZ).
 *
 * V1 usa granularidad de DÍA porque rondas_libres no tiene
 * finalized_at timestamp. V2 puede afinar a ventana de 4h si se
 * agrega ese campo vía migración.
 *
 * @param rondas  lista de rondas finalizadas del usuario (del dashboard)
 * @param fechaHoy ISO date "YYYY-MM-DD" de hoy en Santiago TZ
 * @returns ronda a destacar, o null si no hay ninguna hoy
 */
export function getUltimaRondaReciente(
  rondas: RondaResumen[],
  fechaHoy: string,
): RondaResumen | null
```

**Comportamiento esperado:**
- Si `rondas.length === 0` → null
- Si ninguna ronda tiene `fecha === fechaHoy` → null
- Si hay varias hoy → la primera del array (ya viene ordenada por created_at desc en dashboard)
- No requiere `estado === 'finalizada'` explícito porque `finishedRondas` en dashboard ya filtra por `estado !== 'en_curso'`.

**Tests (mínimo 5):**
1. Retorna null con array vacío.
2. Retorna null si ninguna fecha coincide con hoy.
3. Retorna la ronda si hay una sola con fecha de hoy.
4. Retorna la primera del array si hay múltiples con fecha de hoy.
5. Usa estricta igualdad de string ISO (no parsing de Date, para evitar bugs de TZ).

#### 2. `src/components/mi-golf/UltimaRondaHero.tsx`

**Props:**
```ts
interface Props {
  ronda: RondaResumen  // con total_gross y vsPar ya enriquecidos
}
```

**Render (ver wireframe en sección "UI / Visual spec" abajo):**
- Card con el mismo border/background que los otros estados del hero contextual v2 (seguir pattern ya definido por Juanjo en CompetenciaTab).
- Título pequeño: "Recién terminaste" en gris.
- Subtítulo: course_name + fecha formateada ("Hoy" si coincide con fechaHoy, o fecha relativa).
- Número grande del score: `total_gross` en fuente Playfair Display 42px.
- Chip con vsPar (color: verde si ≤ 0, dorado si +1 a +5, rojo si > +5 — usar paleta Garmin ya existente).
- Fila compacta con acciones: `[Ver mi ronda] [Compartir]`. El primer botón es link a `/ronda-libre/[codigo]`. El segundo dispara share card existente (import del helper compartido).
- **V1 NO incluye botón de dismiss ni highlight row detallado** (el desglose de birdies/dobles vive en RoundHighlights, tras hacer click). La razón: `finishedRondas` del dashboard solo trae `total_gross` y `vsPar`, no hole-by-hole scores. Fetchear scores por cada ronda listada agregaría queries innecesarias para el 99% de los casos donde el usuario no está en el día mismo.

**No requiere tests E2E en V1.** Snapshot test del render opcional.

#### 3. `src/lib/ronda/round-highlights.ts` (helper puro + test)

```ts
export interface HighlightHole {
  hole: number
  par: number
  score: number
  diff: number  // score - par
}

export interface RoundHighlightsData {
  bestHole: HighlightHole | null   // diff más bajo (idealmente negativo)
  worstHole: HighlightHole | null  // diff más alto
  desglose: {
    eagles: number      // diff <= -2
    birdies: number     // diff === -1
    pares: number       // diff === 0
    bogeys: number      // diff === 1
    doublesPlus: number // diff >= 2
  }
  holesPlayed: number
}

export function computeHighlights(
  scores: Record<number, number>,
  parMap: Record<number, number>,
  totalHoles: number,
): RoundHighlightsData
```

**Comportamiento:**
- Itera de 1 a totalHoles, considera solo hoyos con `score > 0`.
- `bestHole` = hoyo con menor diff (desempate: primer hoyo encontrado).
- `worstHole` = hoyo con mayor diff (desempate: primer hoyo encontrado).
- Si `holesPlayed === 0`, `bestHole` y `worstHole` son null.
- Si el jugador hizo solo pares, `bestHole === worstHole` (ambos diff 0). Aceptable en V1.

**Tests (mínimo 6):**
1. Ronda vacía retorna bestHole/worstHole null + desglose en cero.
2. Ronda con 1 birdie: bestHole tiene ese hoyo, worstHole también (si es el único).
3. Ronda con 1 birdie + 1 doble: best y worst distintos, desglose correcto.
4. Eagle cuenta como eagle (no como birdie).
5. Par 5 con score 5 = par (diff 0), no bogey.
6. Scores nulos o 0 se ignoran (hoyo no jugado).

#### 4. `src/components/ronda/RoundHighlights.tsx`

**Props:**
```ts
interface Props {
  data: RoundHighlightsData
  modo: 'gross' | 'neto'  // V1 solo gross; neto se ignora por ahora
}
```

**Render:**
- Solo se renderiza si `data.holesPlayed > 0`.
- Card con mismo estilo que cards del espectador actual (background blanco, border #e2e8f0, borderRadius 14px).
- Sección superior "Tu mejor jugada" si `bestHole !== null` y `bestHole.diff <= 0` — muestra "Hoyo N · Par X · Score Y · [Eagle/Birdie/Par]".
- Sección inferior "Para mejorar" si `worstHole !== null` y `worstHole.diff >= 1` — mismo formato, label distinto.
- Divider.
- Desglose pill row: 5 pills horizontales con conteos (Eagles, Birdies, Pares, Bogeys, Dobles+). Se omiten las que tienen conteo 0 para no cargar visual.
- V1: si el jugador autenticado NO está en la ronda, se oculta (hasta tener data de uso para decidir si mostrar highlights del leader).

**No requiere tests E2E en V1.** La lógica está en `computeHighlights` testeado aparte.

## UI / Visual spec

Ver wireframes textuales en `docs/superpowers/specs/2026-04-21-ultima-ronda-express-design.md` sección "Wireframes" (más abajo).

### UltimaRondaHero layout

```
┌───────────────────────────────────────────┐
│  RECIÉN TERMINASTE                         │  11px/600 gris
│                                            │
│  Los Leones · Recorrido Azul              │  13px text
│  Hoy                                       │  11px textFaint
│                                            │
│           82                               │  42px Playfair, tabular-nums
│        vs par +10                          │  13px chip dorado/rojo según vsPar
│                                            │
│  [  Ver mi ronda  ]  [ Compartir ]         │  primary + secondary, 44px min height
└───────────────────────────────────────────┘
```

(Sin highlight row en V1 — ese nivel de detalle vive en RoundHighlights tras click.)

Colores siguen la paleta Garmin Golf ya definida en `src/lib/garmin-colors.ts` y el tema white de Mi Golf v2.

### RoundHighlights layout

```
┌───────────────────────────────────────────┐
│  RESUMEN DE LA RONDA                       │  11px label
│                                            │
│  ⭐ Tu mejor jugada                         │  13px/600
│  Hoyo 7 · Par 4 · Score 3 · Birdie         │  12px detail
│                                            │
│  ⚠️  Para mejorar                           │  13px/600 (solo si worstHole diff >= 1)
│  Hoyo 14 · Par 3 · Score 5 · Doble         │
│                                            │
│  ──────────────────────────────────        │  divider
│                                            │
│  [2 birdies] [10 pares] [5 bogeys] [1 dbl]│  pills compactos con conteos > 0
└───────────────────────────────────────────┘
```

## Tradeoffs explícitos

| # | Tradeoff | Decisión | Razonamiento |
|---|----------|----------|--------------|
| 1 | Ubicación del hero "última ronda" vs ruta dedicada | 4º estado del hero contextual existente (CompetenciaTab) | 0 clicks post-login. Consistente con el patrón de 3 estados ya diseñado por Juanjo en v2. Ruta dedicada fuerza al usuario a aprender un path nuevo. |
| 2 | Granularidad "reciente": 4 horas vs hoy (fecha) | **Hoy (fecha Santiago TZ)** | `rondas_libres` no tiene `finalized_at` timestamp. Agregar columna requiere migración + backfill. V1 coarse pero cubre el caso principal (restaurant post-ronda el mismo día). V2 puede refinar con migración si hay data de uso que lo justifique. |
| 3 | Highlights: solo jugador autenticado vs todos los jugadores | **Solo jugador autenticado en V1** | Feedback del PM: el usuario post-ronda es ego-centric (quiere ver SU ronda). Multi-jugador agrega UI (tabs/picker) sin valor probado. |
| 4 | Highlights: bloque separado vs integrado en header | **Separado arriba del leaderboard** | Header ya saturado con cancha+fecha+formato+estado. Highlights merecen jerarquía visual propia. Componente reutilizable por si en V2 lo usamos en otras vistas. |
| 5 | Export Fedegolf canvas vs scorecard existente | **Scorecard existente (sin código nuevo)** | PM validó: Fedegolf usa portal online donde usuario transcribe manualmente. Scorecard component (560 LOC) ya muestra hoyo-a-hoyo clicando en el card del jugador en espectador. |
| 6 | Persistencia de "dismiss" del hero | **Sin persistencia en V1** | YAGNI. Si el PM lo pide tras usar V1, se agrega flag en localStorage en 15 minutos. |
| 7 | `getUltimaRondaReciente` en component vs helper puro separado | **Helper puro con tests** | Patrón ya establecido en Sprint 1 (extracción a `src/lib/mi-golf/*`). Testeable sin renderizar. Consistente con `niveles.ts`, `mejor-del-mes.ts`, `taiger-line.ts` ya shippeados. |

## Plan de commits (puros, scope único cada uno)

| # | Commit title | Archivos | Entrega | Riesgo |
|---|--------------|---------|---------|--------|
| A | `feat(mi-golf): hero "última ronda" (4º estado de CompetenciaTab)` | +`src/lib/mi-golf/ultima-ronda.ts` + test<br>+`src/components/mi-golf/UltimaRondaHero.tsx`<br>M`src/components/mi-golf/CompetenciaTab.tsx` | Job #1 resuelto (0 clicks post-ronda) | Bajo — adición condicional con fallback a 3 estados actuales |
| B | `feat(ronda): highlights post-ronda en espectador finalizado` | +`src/lib/ronda/round-highlights.ts` + test<br>+`src/components/ronda/RoundHighlights.tsx`<br>M`src/app/ronda-libre/[codigo]/page.tsx` | Job #2 resuelto (ver desempeño) | Bajo — bloque nuevo, no modifica leaderboard/scorecard/share existentes |

Orden: A → B. Cada uno se shippea y verifica en prod antes del siguiente. Ambos son independientes (no hay acoplamiento de código entre ellos).

## Testing

**Unitarios (Vitest):**
- `ultima-ronda.test.ts`: ≥5 tests cubriendo los casos listados en sección de helper.
- `round-highlights.test.ts`: ≥6 tests cubriendo los casos listados.

**Sin tests E2E nuevos** en V1 — los componentes de render son straightforward y la lógica crítica vive en helpers puros.

**Verificación manual pre-push (cada commit):**
- `npx tsc --noEmit` → 0 errores
- `npm run test -- --run` → todos pasan
- `npm run build` → exitoso
- Flujo real: crear ronda → scorear 3 hoyos → finalizar → cerrar app → abrir → ver UltimaRondaHero → click "Ver mi ronda" → ver RoundHighlights → expandir scorecard → ver scores hoyo-a-hoyo.

## Archivos protegidos

Ningún commit toca: `Navbar.tsx`, `layout.tsx`, `middleware.ts`, `lib/supabase.ts`. Confirmado al momento de diseño.

## Métricas de éxito (para medir post-lanzamiento)

- **Job #1:** % de usuarios que abren el dashboard <4h después de finalizar una ronda y hacen click en "Ver mi ronda".
- **Job #2:** % de usuarios que llegan al espectador finalizado y hacen scroll hasta ver RoundHighlights.
- **No metrics nuevas en V1** — sugerencia a futuro de integrar con analytics existente (`@/lib/analytics.trackEvent`).

## Referencias

- Mi Golf v2 spec: `docs/superpowers/specs/2026-04-21-mi-golf-v2-design.md`
- Sprint 3 E (anti-toque + save inmediato + edit window): `docs/SPRINT_LOG.md` entrada 21 Abr madrugada
- Sprint 1 refactor (patrón de extracción lib/ronda + components/ronda): `docs/SPRINT_LOG.md` entrada 20 Abr
- Garmin palette (colores vsPar): `src/lib/garmin-colors.ts`
- Share card existente: `src/lib/share-card.ts`
- Scorecard component: `src/components/Scorecard.tsx`
