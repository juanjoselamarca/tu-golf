# Spec: UI Modalidades + Formato — Tarjetas correctas y consistentes

**Fecha:** 2026-04-13
**Estado:** Aprobado por PM
**Scope:** 3 capas — datos, tarjetas, historial

---

## Problema

Las 3 modalidades individuales (Stroke Play, Stableford, Match Play) están funcionales
en el backend pero la UI tiene errores de lógica de golf, colores inconsistentes,
y falta de diferenciación visual entre formatos y modos.

### Fallas de lógica golf encontradas

1. **`cellBg()` en historial usa score ABSOLUTO, no vs-par.**
   - Línea 115-121 de `perfil/historial/page.tsx`
   - Un score de 3 en par 3 (par) se pinta igual que 3 en par 5 (eagle)
   - Debe usar `diff = score - par` como ScoreSymbol

2. **`HoleColorBar` tiene colores INCORRECTOS para Garmin.**
   - Birdie es `#FCA5A5` (rosa/rojo) — debería ser `#14B3D9` (celeste Garmin)
   - Eagle es `#93C5FD` (azul claro) — debería ser `#0B6BA6` (azul oscuro Garmin)
   - No coincide con la paleta verificada en CLAUDE.md

3. **`HoleColorBar` solo acepta `gross` — ignora `modo_juego`.**
   - En rondas neto, debería colorear sobre el score neto
   - En Stableford, debería colorear sobre puntos (0-5)

4. **Historial hardcodea par a 36/72.**
   - `const par = holes <= 9 ? 36 : 72` — ignora el par real de la cancha
   - Un par 35 de 9 hoyos muestra +1 cuando en realidad es E

5. **Default `modo` es `'neto'` en el formulario de creación.**
   - `useState<'gross' | 'neto'>('neto')` — línea 93 de nueva/page.tsx
   - Rondas casuales (la mayoría) son gross por defecto en el mundo real
   - Neto requiere handicap — es la excepción, no la regla

6. **`historical_rounds` no tiene `formato_juego` ni `modo_juego`.**
   - Imposible saber qué tipo de ronda fue
   - Todo se muestra como Stroke Play gross por defecto

7. **Espectador usa `scoreCell()` inline en vez de `ScoreSymbol`.**
   - Duplica lógica, no tiene tier albatross (-3)
   - Diverge visualmente del componente canónico

---

## Solución: 3 capas

### Capa 1: Modelo de datos limpio

**1a. Migración SQL — `historical_rounds` necesita formato/modo**

```sql
ALTER TABLE historical_rounds
  ADD COLUMN IF NOT EXISTS formato_juego TEXT DEFAULT 'stroke_play',
  ADD COLUMN IF NOT EXISTS modo_juego TEXT DEFAULT 'gross';

-- Backfill: rounds de rondas_libres que ya tienen formato
UPDATE historical_rounds hr
SET formato_juego = rl.formato_juego,
    modo_juego = rl.modo_juego
FROM rondas_libres rl
WHERE hr.source = 'ronda_libre'
  AND hr.metadata->>'ronda_libre_id' IS NOT NULL
  AND rl.id = (hr.metadata->>'ronda_libre_id')::uuid;

-- Constraints
ALTER TABLE historical_rounds ADD CONSTRAINT historical_rounds_formato_check
  CHECK (formato_juego IN ('stroke_play','stableford','match_play','best_ball','scramble','foursome'));
ALTER TABLE historical_rounds ADD CONSTRAINT historical_rounds_modo_check
  CHECK (modo_juego IN ('gross','neto'));
```

**1b. Default modo → `'gross'`**

Cambiar en:
- `src/app/ronda-libre/nueva/page.tsx` línea 93: `useState('neto')` → `useState('gross')`
- `src/app/organizador/nuevo/NuevoTorneoForm.tsx`: mismo cambio

Razón golf: la mayoría de rondas casuales son gross. Neto es para competencias
con handicap. El usuario que quiere neto lo selecciona conscientemente.

**1c. `formatLabel()` ya existe** en `rules.ts` línea 99. Verificar que todas las
importaciones apunten a `@/golf/core/rules`.

**1d. Actualizar `HistoricalRound` interface** para incluir formato_juego y modo_juego.

### Capa 2: Tarjeta inteligente por modalidad

**2a. Unificar `HoleColorBar` con paleta Garmin**

Reemplazar colores actuales:
```
Eagle (-2+): #0B6BA6 (azul oscuro Garmin)
Birdie (-1): #14B3D9 (celeste Garmin)
Par (0):     #4ade80 (verde)
Bogey (+1):  #D4A442 (dorado Garmin)
Double+ (+2+): #DC3B2E (rojo Garmin)
Sin score:   rgba(0,0,0,0.08)
```

Hacer formato-aware:
- Acepta `modo: ModoJuego` y `handicapIndex?: number` opcionales
- Cuando `modo === 'neto'`: calcula score neto antes de colorear
- Cuando formato es Stableford: colorea por puntos (0=rojo, 1=dorado, 2=verde, 3+=celeste)

**2b. Eliminar `scoreCell()` inline del espectador**

Reemplazar con `<ScoreSymbol>` canónico en `ronda-libre/[codigo]/page.tsx`.

**2c. Arreglar `cellBg()` en historial**

Cambiar de score absoluto a diff vs par:
```typescript
function cellBg(score: number | null, par: number): React.CSSProperties {
  if (score == null) return { background: 'rgba(7,13,24,0.4)', color: '#3a4a5a' }
  const diff = score - par
  if (diff <= -2) return { background: `rgba(11,107,166,0.30)`, color: '#93c5fd' }  // eagle
  if (diff === -1) return { background: `rgba(20,179,217,0.25)`, color: '#67e8f9' } // birdie
  if (diff === 0)  return { background: 'rgba(0,0,0,0.04)', color: 'var(--text)' }  // par
  if (diff === 1)  return { background: 'rgba(196,153,42,0.25)', color: '#fcd34d' } // bogey
  return { background: 'rgba(220,59,46,0.30)', color: '#fca5a5' }                   // double+
}
```

**2d. Score display por formato en tarjeta**

| Formato | Score principal | Subtext |
|---------|----------------|---------|
| Stroke Play Gross | `78` | `+6` (vs par real) |
| Stroke Play Neto | `78` | `neto 72 (E)` |
| Stableford | `34 pts` | — |
| Match Play | `3&2` o `1UP` | vs [rival] |

### Capa 3: Historial Garmin-style

**3a. Badge de formato visible**

Cada round card muestra un pill dorado con `formatLabel(formato_juego, modo_juego)`.
Posición: junto al nombre de cancha, debajo de la fecha.

**3b. `HoleColorBar` renderizado en cada card**

Actualmente importado pero nunca usado. Activar debajo del score principal,
usando la versión formato-aware de Capa 2a.

**3c. Par real desde course data**

En vez de `const par = holes <= 9 ? 36 : 72`:
- Si `course_id` existe → buscar par real del curso
- Fallback: sumar pares del array de scores si están en metadata
- Último fallback: 36/72

**3d. Fetch formato_juego y modo_juego en query del historial**

Actualizar el select de Supabase para incluir los nuevos campos.

---

## Orden de ejecución

```
Capa 1 (datos)     → commit + verificar migración
Capa 2 (tarjetas)  → commit + verificar TypeScript + tests
Capa 3 (historial) → commit + verificar build
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/023_historical_formato_modo.sql` | NUEVO — migración |
| `src/golf/core/rules.ts` | Verificar formatLabel exports |
| `src/app/ronda-libre/nueva/page.tsx` | Default gross, no neto |
| `src/app/organizador/nuevo/NuevoTorneoForm.tsx` | Default gross |
| `src/components/HoleColorBar.tsx` | Paleta Garmin + formato-aware |
| `src/components/ScoreSymbol.tsx` | Sin cambios (ya correcto) |
| `src/app/perfil/historial/page.tsx` | cellBg vs-par, badges, HoleColorBar, formato query |
| `src/app/ronda-libre/[codigo]/page.tsx` | Reemplazar scoreCell inline → ScoreSymbol |
| `src/types/database.ts` | HistoricalRound + formato/modo |

## Fuera de scope

- Modalidades de equipo (Best Ball, Scramble, Foursome) — UI deshabilitada, sprint separado
- Share cards — ya tienen formato_juego, solo necesitan la migración de historial
- Scorecard v2 component — ya en main, no requiere cambios
