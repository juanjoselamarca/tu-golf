# Rediseño Scorecards — Research Garmin Golf

**Fecha:** 2026-04-10
**Branch:** `feat/redesign-scorecards`

## Resumen ejecutivo del análisis Garmin

Estudié 26 screenshots reales de Garmin Golf (tarjetas post-ronda, vista historial/activity) y el sistema visual de Garmin se resume en:

**La tarjeta de Garmin gana porque es minimalista, legible de un vistazo, usa íconos universales del golf, y cada elemento tiene una sola función.**

---

## Sistema visual Garmin — Scorecard detallada

### Layout general

```
┌─────────────────────────────────────────┐
│  ←                    share    menu    │   ← Header simple
│                                         │
│              [  🏌️  ]                   │   ← Ícono golfista circular gris
│         Club De Golf Lomas De           │
│                 La Dehesa                │   ← Nombre club grande, centrado
│              Mens Tees                  │   ← Tees
│              Mar 21, 2026               │   ← Fecha
│              Stroke Play                │   ← Formato (simple)
├─────────────────────────────────────────┤  ← Separador sutil (bg gris claro)
│                                         │
│  Scorecard                      Edit    │  ← Título sección + acción naranja
│                                         │
│  ┌─────────────────────────────────────┐│  ← Card blanca con shadow
│  │ [avatar] Juan José Lamarca  88 +16 ││  ← Avatar + nombre + score + vs par
│  │                                     ││
│  │  1  2  3  4  5  6  7  8  9  Out     ││  ← Números hoyo (gris pequeño)
│  │  4  4  3  4  4  3  4  5  5   36     ││  ← Par (gris pequeño)
│  │  6  5  3  4  6  3  4  7  8   46     ││  ← Score con íconos
│  │ [¤][¤]       [¤]      [¤][¤]        ││  ← Iconos bajo cada número
│  │ ············································ ││  ← Separador delgado
│  │  10 11 12 13 14 15 16 17 18  In     ││
│  │  4  5  4  4  3  4  3  3  4   36     ││
│  │  4 [4] 6  5  4 [4][5][4] 6   42     ││
│  │    (○)                              ││
│  │                                     ││
│  │ View Full Scorecard                 ││  ← CTA naranja secundaria
│  │ ─────────────────────               ││
│  │ View Shot Maps                      ││  ← CTA naranja secundaria
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### Sistema de íconos (CRÍTICO)

Cada score tiene un ícono que cambia según la relación con el par:

| Resultado | Ícono | Color |
|-----------|-------|-------|
| **Albatross (-3) o mejor** | Círculo doble concéntrico | Azul oscuro (no visto en fotos pero implícito) |
| **Eagle (-2)** | Círculo doble concéntrico | Celeste (no visto) |
| **Birdie (-1)** | **Círculo simple** | **Celeste claro (#00A8CC aprox)** |
| **Par (0)** | **Sin marca** | Número en negro normal |
| **Bogey (+1)** | **Cuadrado simple** | **Dorado/naranja (#E8A838 aprox)** |
| **Doble bogey+ (+2 o peor)** | **Cuadrado doble concéntrico** | **Rojo (#DC3B2E aprox)** |

**Importante:** El ícono CONTIENE al número, no lo reemplaza. El número se lee dentro del círculo/cuadrado.

**Tamaño del ícono:** ~28-32px de ancho, centrado sobre el número. Los círculos/cuadrados dobles tienen un gap de 2-3px entre los dos trazos.

**Grosor del trazo:** ~1.5-2px, NO fill (solo outline).

### Strokes recibidos (handicap)

- Cuando un jugador recibe strokes de handicap en un hoyo, aparecen **puntos grises debajo del número del score**.
- **1 punto (·) = 1 stroke recibido**
- **2 puntos (··) = 2 strokes recibidos**
- Los puntos van CENTRADOS debajo del ícono del score.
- Si el modo es gross (sin handicap), NO hay puntos.
- Esta es una forma MUY elegante de mostrar strokes — nuestra implementación actual usa ● dorados grandes, Garmin usa puntos grises pequeños (menos invasivos).

### Estructura de la tabla

- **6 filas**: hoyo / par / score-con-ícono / separador / hoyo (back) / par / score-con-ícono
- **10 columnas**: 9 hoyos + "Out" (o "In") para el total de cada 9
- **Front 9 y Back 9 separados** por una línea horizontal sutil
- **Fuente monoespaciada** para los números (alineación perfecta)
- **Tamaño de número del score**: ~18-22px, dominante
- **Tamaño de número de hoyo y par**: ~14-16px, gris

### Información faltante / ausente en tarjeta inicial

Lo que Garmin **no muestra** en la tarjeta principal (queda para "View Full Scorecard"):
- Yardajes
- Stroke index
- Putts
- Fairways hit / Greens in regulation
- Tiempos
- Clubs usados

Garmin apuesta a la **simplicidad**: si quieres el detalle, click en "View Full Scorecard".

### Header del club

- Ícono pequeño de golfista (persona con palo) en círculo gris claro (~48px)
- Nombre del club en **negro, bold, 24-28px, centrado**, puede ocupar 2 líneas
- Subtítulo con 3 líneas centradas (tees / fecha / formato) en gris ~14px
- Fondo con trazado sutil de un hoyo (decoración minimalista)

### Score del jugador (header de card)

- Avatar circular pequeño (~40px)
- Nombre del jugador en negro medium (~18px)
- **Score gross total en negro muy grande** (~28px)
- Vs par en gris pequeño al lado del score grande (ej: "88 +16")
- El vs par NO tiene signo "+" delante cuando es 0 (sería "E")

---

## Sistema visual Garmin — Historial (Activity)

### Layout

```
┌─────────────────────────────────────────┐
│  Activity                          ≡    │  ← Título gigante + filtro
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 🏌️ Golf              Feb 4, 2026    ││  ← Icono + Golf + fecha
│  │ Club De Golf Los Leones  52  +16    ││  ← Nombre club + score gigante
│  │ Stroke Play                         ││  ← Formato
│  │ ●●●●●●●●● ● ● ● ● ● ● ● ● ●         ││  ← Barra horizontal de colores
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 🏌️ Golf              Feb 4, 2026    ││
│  │ Club De Golf Los Leones  93  +21    ││
│  │ Stroke Play                         ││
│  │ ●●●●●●●●●●●●●●●●●●                  ││
│  └─────────────────────────────────────┘│
│                                         │
│  [Activity] [Stats] [+] [Profile] [⚙]  │  ← Bottom nav
└─────────────────────────────────────────┘
```

### Barra de colores horizontal (MAGIC INGREDIENT)

Cada ronda en la lista tiene una **barra horizontal** al fondo del card que muestra el desempeño hoyo-por-hoyo en una sola línea visual:

- **Cada hoyo es un segmento corto** con gap entre segmentos
- **Colores** (inferidos de las fotos):
  - 🟢 **Verde** = muy bien (par/birdie) — en algunas fotos se ven muchos verdes en rondas cerca del par
  - 🟡 **Amarillo/dorado** = bogey
  - 🔴 **Rojo** = doble bogey o peor
  - 🔵 **Celeste** = birdie (visto como segmento diferente en alguna barra)
- **Ancho de la barra**: fijo (se adapta al ancho del card)
- **Gaps**: ~2-3px entre segmentos, hace que se vea "modular"
- **Altura**: ~6-8px (delgada, no dominante)

**Este elemento es LA gran innovación visual**: permite al usuario escanear su historial y ver de un vistazo "esta ronda fue mayoritariamente verdes" vs "esta ronda fue mayoritariamente rojos" sin necesidad de abrir nada.

### Jerarquía del card de historial

1. **Icono + Golf + fecha** (línea superior, pequeña, gris)
2. **Nombre del club** (mediano-grande, puede ser 2 líneas si es largo)
3. **Score gigante + vs par** (a la derecha, el ancla visual)
4. **Formato** (línea gris pequeña)
5. **Barra de colores** (al fondo del card)

---

## Lecciones clave para Golfers+

### Lo que DEBEMOS copiar

1. **Sistema de íconos**: círculos para birdies, cuadrados para bogeys, dobles para ±2. Colores Garmin ya verificados en `src/lib/garmin-colors.ts`.
2. **Separación Front 9 / Back 9** con totales "Out" / "In"
3. **Layout vertical**: números hoyo → par → score con ícono
4. **Puntos grises discretos** para strokes del handicap (no los ● dorados grandes que usamos)
5. **Header con ícono circular + nombre centrado** del club
6. **Barra de colores horizontal** en la vista de historial/activity
7. **Minimalismo agresivo**: todo lo no esencial va en "View Full Scorecard"
8. **Fondo gris claro** para el área del scorecard, card blanco con shadow sutil
9. **CTAs secundarias en naranja/dorado** como texto link, no botones

### Lo que DEBEMOS mejorar sobre Garmin

1. **Soporte nativo para modalidades** (Gross/Neto/Stableford/Match Play) — Garmin solo muestra Stroke Play
2. **Match Play** con formato específico (3&2, AS, etc) — Garmin no lo tiene
3. **Stableford** con columna de puntos — Garmin no lo tiene
4. **GWI (Golf Win Index)** — nuestra feature diferenciadora, no existe en Garmin
5. **Vista espectador en vivo** — Garmin es post-ronda, nosotros podemos mostrar rondas en curso
6. **Compartir** con diseño generado, no solo "Copy Link"

### Lo que debemos AGREGAR (único de Golfers+)

1. **Diferenciación visual entre Live y Final** (Garmin solo muestra post-ronda)
2. **Indicador sutil del modo** (Gross/Neto/Stableford/Match Play) sin ocupar demasiado espacio
3. **Leaderboard multi-jugador** cuando hay varios jugadores en la ronda
4. **Expand/collapse** por jugador en el leaderboard

---

## Colores Garmin Golf verificados

De `src/lib/garmin-colors.ts` + confirmación visual de las fotos:

```typescript
{
  // Birdie y mejor — círculos
  birdie: '#00A8CC',        // celeste claro (verificado en fotos)
  eagle: '#0066A4',         // azul más oscuro (inferido, no visto en fotos)

  // Par — sin marca
  par: 'transparent',       // número en negro normal

  // Bogey — cuadrado simple
  bogey: '#E8A838',         // dorado/naranja (verificado)

  // Doble bogey+ — cuadrado doble
  double: '#DC3B2E',        // rojo (verificado)
}
```

Verificaré el archivo exacto en la auditoría de código.

---

## Próximo paso

**Fase 1b**: Auditar el código actual de tarjetas en Golfers+ para documentar:
- Qué archivos tienen vistas de scorecard
- Qué elementos compartimos vs duplicamos
- Bugs visuales conocidos
- Lo que no coincide con Garmin (y qué queremos cambiar)

---

## Auditoría del código actual — Scorecards en Golfers+

### Archivos con lógica de scorecard

| Archivo | Líneas | Rol | Usa componente compartido |
|---------|--------|-----|---------------------------|
| `src/app/ronda-libre/[codigo]/page.tsx` | 1932 | **Vista espectador**: scorecard dentro de expandable del leaderboard | ❌ Tiene su propio `scoreCell` inline duplicado |
| `src/app/ronda-libre/[codigo]/score/page.tsx` | 1868 | **Scoring individual**: tarjeta del jugador scoreando (vista hoyo-por-hoyo, no scorecard completo) | ❌ |
| `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` | 764 | **Scoring grupo (admin)**: UI para anotar scores de todo el grupo | ❌ |
| `src/app/perfil/historial/page.tsx` | 1146 | **Historial del jugador**: lista de rondas pasadas + scorecard expandible | ✅ Usa `<ScoreSymbol>` |
| `src/components/ScoreSymbol.tsx` | 176 | **Componente compartido** que renderiza el ícono por diff vs par | — |
| `src/components/LeaderboardTable.tsx` | 827 | Leaderboard de torneos (no es scorecard individual) | ❌ |
| `src/components/MobileLeaderboard.tsx` | 271 | Leaderboard mobile de torneos | ❌ |
| `src/components/import/StepReview.tsx` | — | Vista de revisión al importar scorecards desde foto | ✅ Usa `<ScoreSymbol>` |

### Problema raíz #1 — Divergencia de implementación

**El espectador (`ronda-libre/[codigo]/page.tsx`) tiene su propia función `scoreCell` inline duplicada** (líneas 1558-1588) que NO usa el componente compartido `<ScoreSymbol>`. Esto genera:
- Estilos distintos entre espectador e historial
- Bugs corregidos en uno no se propagan al otro
- Imposible de mantener consistencia visual

### Problema raíz #2 — Colores PGA en vez de Garmin

El componente `<ScoreSymbol>` (el compartido) usa la paleta **PGA clásica** donde "bueno = dorado" y "malo = rojo":

| Resultado | Actual (PGA) | Debería ser (Garmin) |
|-----------|--------------|----------------------|
| Hole-in-one (1) | Dorado `#c4992a` relleno doble | Mismo ícono que eagle/albatross |
| Albatross (-3+) | Azul `#60A5FA` relleno doble | Azul oscuro doble círculo |
| **Eagle (-2)** | **Dorado `#c4992a` doble círculo** | **Azul oscuro doble círculo** |
| **Birdie (-1)** | **Dorado `#c4992a` círculo simple** | **Celeste `#00A8CC` círculo simple** |
| Par (0) | Sin marca ✅ | Sin marca ✅ |
| **Bogey (+1)** | **Rojo `#EF4444` cuadrado simple** | **Dorado `#E8A838` cuadrado simple** |
| Doble bogey (+2) | Rojo `#EF4444` doble cuadrado | Rojo `#DC3B2E` doble cuadrado ✅ |
| Triple+ (+3) | Rojo `#DC2626` cuadrado RELLENO | Rojo doble cuadrado (igual que doble bogey) |

**El cambio clave:** Garmin usa **celeste para cosas buenas** (birdie/eagle), **naranja para bogey**, **rojo solo para doble bogey+**. Nuestra paleta actual usa dorado para todo lo bueno y rojo para todo lo malo.

El comentario en `src/golf/core/colors.ts` dice "Verificado contra capturas reales 24 Mar 2026" pero lo que está verificado es el **mapping color → diff** (para importar de Garmin), NO los colores que usa Golfers+ para renderizar.

### Problema raíz #3 — Tarjeta del espectador escondida en expandable

Cuando un jugador termina su ronda, la tarjeta está **escondida dentro del leaderboard** en un acordeón expandible. El usuario tiene que tocar su nombre para ver su tarjeta. **Garmin muestra la tarjeta del jugador como protagonista**, no como detalle colapsado.

Para la vista "ronda finalizada" la tarjeta debería ser el **elemento principal** de la pantalla, no un detalle dentro del leaderboard.

### Problema raíz #4 — Layout apretado y poco legible

En el espectador (`page.tsx:1588-1614`):
- Número de hoyo: `fontSize: '8px'` — ilegible en mobile
- Score con ícono: `fontSize: '11px'` — muy chico para ser protagonista
- Box del ícono: `22x22px` — apenas se distinguen los dobles círculos/cuadrados
- **NO se muestra la fila de PAR** arriba del score (en Garmin sí)
- Scorecard fondo gris `#f9fafb`, muy pálido
- Todo ocurre dentro de un flex row con `minWidth: 0` que colapsa

En el historial (`historial/page.tsx:974-998`):
- Mejor tamaño usando `<ScoreSymbol size="sm">` (22x22)
- Pero mismo problema: no muestra fila de PAR arriba
- El número del hoyo es `fontSize: '8px'` — también muy chico

### Problema raíz #5 — Strokes del handicap implementados de forma invasiva

En el score-grupo (`score-grupo/page.tsx:629-637`) y score individual (`score/page.tsx:1136-1146`) se muestran **dots dorados grandes (`●`)** para cada stroke recibido. Garmin usa **puntos grises pequeños (`·`) debajo del número**, mucho más discreto.

Además, la vista del espectador **NO muestra los strokes recibidos en el scorecard expandible**. En Garmin esto sí se ve.

### Problema raíz #6 — Vista de historial no tiene barra de colores

El historial en Garmin muestra una **barra horizontal de colores hoyo-por-hoyo** en cada card de ronda, lo que permite escanear el historial visualmente. Nuestro historial solo muestra el score total y vs par — hay que expandir para ver cualquier detalle.

### Problema raíz #7 — "Scorecard" vs "Vista scoring en vivo"

Hay confusión entre:
- **Scorecard** = la tarjeta final/histórica que se lee como un registro (Garmin style)
- **Vista de scoring en vivo** = la UI donde un jugador ingresa su score hoyo por hoyo (interfase de data entry)

La app actualmente mezcla estos dos conceptos en el mismo visual. El scoring en vivo (`score/page.tsx`) muestra UN hoyo gigante con teclado numérico. Eso NO es una tarjeta — es una UI de data entry. No lo vamos a tocar en este rediseño.

**Lo que sí vamos a rediseñar:** las vistas de tarjeta como "lectura del resultado":
1. Scorecard del espectador (expandible por jugador)
2. Scorecard en vista de ronda finalizada (destacado)
3. Scorecard en historial (expandible por ronda)
4. Compartir scorecard (imagen generada — a ver si hay que tocar)

### Resumen de la auditoría

| # | Problema | Dónde | Prioridad |
|---|----------|-------|-----------|
| 1 | Código duplicado: espectador tiene su propio `scoreCell` inline | page.tsx:1558 | **ALTA** |
| 2 | Colores PGA (dorado/rojo) en vez de Garmin (celeste/dorado/rojo) | ScoreSymbol.tsx | **ALTA** |
| 3 | Tarjeta del jugador escondida en expandable cuando la ronda termina | page.tsx:1552 | **ALTA** |
| 4 | Layout apretado: fuentes chicas (8px, 11px), sin fila PAR, sin mono | page.tsx, historial.tsx | **ALTA** |
| 5 | Strokes con ● dorados grandes (invasivos) | score-grupo, score | **MEDIA** |
| 6 | Strokes NO visibles en scorecard del espectador | page.tsx expandable | **MEDIA** |
| 7 | Historial sin barra de colores hoyo-por-hoyo | historial/page.tsx | **MEDIA** |
| 8 | Inconsistencia: historial usa ScoreSymbol, espectador no | varios | **ALTA** |
| 9 | LeaderboardTable usa su propio sistema | LeaderboardTable.tsx | **BAJA** (scope aparte) |

