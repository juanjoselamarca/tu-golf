# ARQUITECTURA GOLFERS+

## Stack
Next.js 14 · Supabase · Tailwind CSS · TypeScript · Vercel

## URLs
Producción: https://golfersplus.vercel.app
GitHub: github.com/juanjoselamarca/tu-golf (branch: main)
Supabase: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce

## Motor de reglas de golf — src/golf/

Toda la lógica de golf está centralizada en `src/golf/`:

```
src/golf/
  core/         Reglas universales
    rules.ts      ModoJuego, labels, formateo vsPar
    scoring.ts    Strokes, neto, stableford, resumen de ronda
    compare.ts    Comparar rondas por vsPar (NO por gross), separar 9/18 hoyos
    colors.ts     Colores por resultado + Garmin color mapping

  formats/      Modalidades de juego (extensible)
    index.ts      Interface GolfFormat + registry
    stroke-play   Medal play (activo)
    stableford    Puntos (activo)
    (futuro: match-play, best-ball, foursome, scramble)

  stats/        Métricas e índices
    personal.ts   Stats centralizadas con vsPar
    gwi.ts        GWI™ — probabilidad de ganar en ronda activa
    cpi.ts        CPI™ — índice de rendimiento (0-100)

  courses/      Canchas
    types.ts      Course, CourseHole, CourseTee, CourseSummary
    data.ts       Queries Supabase para canchas
    matching.ts   Fuzzy matching de nombres

  coach/        tAIger+ coach IA
    prompts.ts    System prompt y session starters
    patterns.ts   Biblioteca de patrones (extensible)
    analysis.ts   Motor de análisis de rondas (extensible)
```

### Regla clave
NUNCA comparar rondas por gross absoluto. Siempre usar `vsPar()` de `core/compare.ts`.
Un 44 en 9 hoyos (par 36 = +8) NO es mejor que un 82 en 18 hoyos (par 72 = +10).

### Cómo agregar un formato nuevo
1. Crear `src/golf/formats/match-play.ts`
2. Implementar interface `GolfFormat`
3. Registrar en `FORMATS` de `formats/index.ts`

## REGLA CRÍTICA — Nombres de columnas en BD
SIEMPRE usar estos nombres exactos:
- course_holes.numero (NO hole_number)
- course_holes.stroke_index
- courses.nombre (NO name)
- courses.ciudad, courses.pais
- profiles.role (NO rol): 'player' | 'organizer' | 'admin'
- rondas_libres.estado: 'en_curso' | 'finalizada' (NUNCA 'in_progress' ni 'closed')

## Tablas por función
SCORING:   hole_scores, rounds, ronda_libre_jugadores
TORNEOS:   tournaments, players, categories, flights
HISTORIAL: historical_rounds
COACHING:  player_patterns, taiger_sessions, player_psych_profile
TRACKING:  handicap_history
LIBRE:     rondas_libres, ronda_libre_jugadores

## Modelo de canchas — FUENTE DE VERDAD

Este es el modelo conceptual real del golf. La BD actual lo aproxima de forma
flat (ver "Mapeo a la BD actual" abajo) pero toda lógica de negocio debe
razonar sobre el modelo conceptual, no sobre el flat.

### Jerarquía conceptual

```
Club de Golf
  └─ Recorrido (loop físico de 9 hoyos: "Norte", "Sur", "Este", etc.)
       └─ Hoyo (par + stroke_index propios del recorrido — físicos, no por género)

Cancha jugable = combinación de 1 o 2+ recorridos
  ├─  9 hoyos  → 1 recorrido (ej. "Norte")
  ├─ 18 hoyos  → 2 recorridos (ej. "Norte–Este")
  ├─ 27 hoyos  → 3 recorridos
  └─ 36 hoyos  → 4 recorridos (ej. Las Brisas Santo Domingo: Norte/Sur/Este/Oeste combinables)
```

Cada hoyo de la cancha jugable tiene N tees (salidas), de más lejos a más
cerca del green:

| Tee     | Color   | Asignación de jugador por defecto                         |
|---------|---------|-----------------------------------------------------------|
| Negras  | Negro   | HCP < 5 (jugadores bajo)                                  |
| Azules  | Azul    | Varones HCP < 18 y edad < 55                              |
| Blancas | Blanco  | Senior: HCP ≥ 18 o edad ≥ 55                              |
| Doradas | Dorado  | Super Senior: edad ≥ 70                                   |
| Rojas   | Rojo    | Damas (default)                                           |

**Cada tee tiene su propio yardaje, slope_rating y course_rating.** Lo común
es que difieran tee a tee; pueden coincidir en casos puntuales pero no es lo
habitual.

### Por qué slope/CR varían por género

Las reglas WHS (USGA/R&A) calculan course rating contra un "scratch player"
estándar — uno definido para hombres, otro para damas. La misma cancha física
con el mismo tee tiene **dos ratings oficiales distintos** según el género del
jugador. El yardaje es físico (no cambia), el rating sí.

### Mapeo a la BD actual (deuda conocida)

| Nivel conceptual              | En la BD                                      | Brecha                                        |
|-------------------------------|-----------------------------------------------|-----------------------------------------------|
| Club                          | implícito en `courses.nombre` (prefijo)       | sin tabla `clubs` propia                      |
| Recorrido (9 hoyos físicos)   | NO existe como entidad                        | los recorridos viven solo dentro del nombre   |
| Cancha jugable                | una fila en `courses` por género              | duplicada como `(DAMAS)` y `(VARONES)`        |
| Hoyo                          | `course_holes` con `course_id` por género     | duplicados — el mismo hoyo físico cargado 2x  |
| Tee                           | `course_tees` con un solo slope/CR por fila   | sin slope/CR cruzado por género en una fila   |

**Consecuencias prácticas:**
- 137 filas FedeGolf en `courses` representan ~68 canchas físicas reales.
- Yardajes de hoyos aparecen duplicados en la fila DAMAS y la fila VARONES del
  mismo loop físico.
- Una cancha como "Brisas Santo Domingo - Norte–Este (VARONES)" y
  "Brisas Santo Domingo - Norte–Este (DAMAS)" son la **misma cancha jugable**
  con ratings distintos.

### Reglas de validación de datos

Para que una fila en `courses` se considere íntegra:

1. **par_total = SUM(course_holes.par)** sobre los hoyos cargados de esa cancha.
2. **COUNT(course_holes) ∈ {9, 18, 27, 36}** — no múltiplos extraños.
3. **stroke_index únicos por cancha**, valores 1..N donde N = num_hoyos.
4. **Jerarquía de yardajes por hoyo**: `negras ≥ azul ≥ blanco ≥ rojo` (con
   tolerancia ±2 yds por carga manual).
5. **Yardajes > 0** y dentro de rango razonable por par (par 3: 80–260 yds,
   par 4: 250–500 yds, par 5: 430–650 yds — solo orientativo, no excluyente).
6. **Coherencia DAMAS↔VARONES**: para el mismo `(club, recorrido)`, el par y
   el stroke_index de cada hoyo deben coincidir entre las filas DAMAS y VARONES.
7. **Yardajes por género esperado**: una fila DAMAS típicamente solo carga
   yardaje de Rojas (y a veces Doradas); cargar Negras en una fila DAMAS es
   ruido salvo que haya ratings damas para esos tees.

### Refactor futuro (no urgente)

Cuando el modelo flat actual cause más fricción que beneficio, el target es:

```sql
clubs           (id, nombre, ciudad, pais, foto_url, lat, lng, sitio_web)
recorridos      (id, club_id, nombre, num_hoyos)
recorrido_holes (id, recorrido_id, numero, par, stroke_index)
canchas_jugables(id, club_id, nombre, tipo)         -- "Norte-Este", etc
cancha_recorridos(cancha_id, recorrido_id, orden)   -- 1=primeros 9, 2=segundos 9
tees            (id, cancha_id, color, yardaje_total,
                 cr_varones, slope_varones, cr_damas, slope_damas)
tee_holes       (tee_id, recorrido_hole_id, yardaje)
```

Trade-off: elimina la duplicación DAMAS/VARONES, permite combinar recorridos
sin re-cargar hoyos, y soporta CR/slope por género en una sola fila. Costo:
migración no trivial + reescritura de queries de scoring.

**Decisión actual:** mantener el modelo flat hasta que un caso real lo rompa.
Documentado como deuda visible en TECH_DEBT.md.

## Sistema de Diseño
bg-deep: #070d18 | bg-card: #0e1c2f
gold/brand: #c4992a | gold-light: #c8a55a
ivory/text: #edeae4 | gray-soft: #94a8c0

Títulos: Playfair Display | UI: DM Sans | Métricas: DM Mono | Números grandes: Cormorant Garamond

## Servicios externos
- Sentry: monitoreo de errores (DSN en NEXT_PUBLIC_SENTRY_DSN)
- PostHog: analytics de comportamiento (token en NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN)
- Anthropic: tAIger+ coach IA (ANTHROPIC_API_KEY)

## Flujo tAIger
ronda completada → patterns_need_recalc = TRUE
→ POST /api/taiger/patterns → calcula patrones
→ GET /api/taiger/context → contexto completo
→ Claude API → análisis + técnica
→ guardado en taiger_sessions

## Regla de oro del scoring
Siempre guardar gross_score + net_score + points en BD.
El modo_juego solo afecta QUÉ SE MUESTRA, no qué se guarda.

---

## Theming

### Modelo
Sistema binario light/dark. **Light es el default**. Dark es opt-in via toggle del
Navbar. Sin `auto`. Sin identidad fija por ruta — TODA la app respeta el toggle.

### Flujo
1. ThemeContext lee `localStorage['golfers-theme']` → `'light' | 'dark'`. Default `light`.
   Cualquier valor legacy (incluyendo `'auto'`) migra silenciosamente a `'light'`.
2. Resolved theme se escribe a `document.documentElement.setAttribute('data-theme', ...)`.
3. `<meta name="theme-color">` se actualiza dinámicamente vía `<ThemeMetaColor />`.

### Anti-FOUC
Script inline en `<head>` lee storage y setea `data-theme` en `<html>` antes del
primer paint. `suppressHydrationWarning` en `<html>` para tolerar la mutación
pre-hidratación.

### Tokens
- `:root` — brand colors, fonts, score colors, legacy palette aliases (mismo en
  ambos modos) + paleta light como **fallback** para JS-disabled.
- `[data-theme="light"]` — paleta light premium (off-white `#fafaf7`, carbón
  `#1a1d24`, sombras editoriales).
- `[data-theme="dark"]` — paleta dark (navy `#070d18`, ivory `#edeae4`, gold
  accent en bordes).

### Tailwind dark mode
`darkMode: ['selector', '[data-theme="dark"]']` en `tailwind.config.ts`.
Las clases `dark:` activan cuando `[data-theme="dark"]` está en el árbol —
coherente con los tokens, NO por preferencia del OS.

### Toggle UI
Toggle binario sol/luna en el dropdown del Navbar avatar. Estado activo: fondo
`--brand`, texto `--brand-dark`. Persiste en `localStorage`. `min-height: 44px`
en cada botón (Apple HIG).

### Convenciones
- Para definir tema en componentes nuevos: usar tokens (`var(--bg)`, `var(--text)`).
- NUNCA hardcodear hex de paleta neutra (cream, navy, ivory). Sí OK hardcodear
  brand colors (gold `#c4992a`) y score colors (Garmin verified) ya que son
  iguales en ambos modos.
- Para CTAs gold (`background: '#c4992a'`), texto siempre `var(--brand-dark)`.

### Out of scope (sprints futuros)
- Sincronización theme preference con BD del usuario (multi-device).
- Animar transiciones entre modos.
- Modo "tournament" alto contraste para uso bajo sol.

### Histórico
- 28-30 abr: tri-state Auto/Light/Dark con identidad fija. Bug estructural detectado.
- 04 may: corrección — sistema binario light-default sin identidad fija.

Spec/plan:
- `docs/superpowers/plans/2026-05-04-theme-binario-light-default.md`
