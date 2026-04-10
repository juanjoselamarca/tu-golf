# Separación Formato vs Modo — Corrección Conceptual de Golf

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar los dos ejes ortogonales del golf — Formato de competencia (stroke play, stableford, match play...) y Modo de scoring (gross/neto) — que actualmente están mezclados en un solo campo `modo_juego`.

**Architecture:** La BD ya tiene `formato_juego` (migración 020) pero el frontend solo lee `modo_juego` que contiene valores híbridos (`'stableford'`, `'match_play_neto'`). Se normalizan ambas columnas, se actualiza el type system, se refactorean las 85 referencias en el frontend, y se agrega selector Gross/Neto en la UI de creación.

**Tech Stack:** Next.js 14, TypeScript, Supabase (PostgreSQL), Vitest

**Estado actual de la BD:**
- `rondas_libres.modo_juego`: CHECK (`'gross'`, `'neto'`, `'stableford'`, `'match_play_neto'`)
- `rondas_libres.formato_juego`: CHECK (`'stroke_play'`, `'stableford'`, `'match_play'`, `'best_ball'`, `'scramble'`, `'foursome'`)
- `tournaments.modo_juego`: misma situación
- `tournaments.formato_juego`: misma situación

**Archivos impactados (por cantidad de cambios):**

| Archivo | Refs a cambiar | Tipo |
|---------|---------------|------|
| `src/golf/core/rules.ts` | 5 | Tipos + metadata |
| `src/types/database.ts` | 3 | Tipos |
| `src/golf/core/scoring.ts` | 3 | Motor scoring |
| `src/app/ronda-libre/[codigo]/page.tsx` | ~25 | Vista espectador |
| `src/app/ronda-libre/[codigo]/score/page.tsx` | ~8 | Scoring individual |
| `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` | ~5 | Scoring grupo |
| `src/app/ronda-libre/nueva/page.tsx` | ~8 | Creación ronda |
| `src/app/organizador/nuevo/NuevoTorneoForm.tsx` | ~3 | Creación torneo |
| `src/golf/stats/gwi.ts` | 2 | Estadísticas |
| `src/components/GWILeaderboard.tsx` | 1 | Display |
| `src/components/MiniLeaderboard.tsx` | 1 | Display |

---

## Task 1: Migración BD — normalizar modo_juego a solo gross/neto

**Files:**
- Create: `supabase/migrations/022_normalize_modo_juego.sql`

Esta migración es idempotente y segura: no pierde datos porque `formato_juego` ya existe y fue backfillado en migración 020.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/022_normalize_modo_juego.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 022 — Normalizar modo_juego: separar formato de modo
--
-- ANTES: modo_juego = 'gross' | 'neto' | 'stableford' | 'match_play_neto'
-- DESPUÉS: modo_juego = 'gross' | 'neto' (solo el eje de scoring)
--          formato_juego = fuente de verdad para el formato de competencia
--
-- Ejecutar en: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Asegurar que formato_juego está correctamente populado ─────────
-- (Re-run del backfill por seguridad, idempotente)
UPDATE rondas_libres SET formato_juego = 'stableford'
  WHERE modo_juego = 'stableford' AND (formato_juego IS NULL OR formato_juego = 'stroke_play');

UPDATE rondas_libres SET formato_juego = 'match_play'
  WHERE modo_juego = 'match_play_neto' AND (formato_juego IS NULL OR formato_juego = 'stroke_play');

-- Lo mismo para tournaments
UPDATE tournaments SET formato_juego = 'stableford'
  WHERE modo_juego = 'stableford' AND (formato_juego IS NULL OR formato_juego = 'stroke_play');

UPDATE tournaments SET formato_juego = 'match_play'
  WHERE modo_juego = 'match_play_neto' AND (formato_juego IS NULL OR formato_juego = 'stroke_play');

-- ─── 2. Normalizar modo_juego a solo gross/neto ───────────────────────
-- Stableford es siempre neto (R&A Rule 32.1b)
UPDATE rondas_libres SET modo_juego = 'neto'
  WHERE modo_juego = 'stableford';

UPDATE rondas_libres SET modo_juego = 'neto'
  WHERE modo_juego = 'match_play_neto';

UPDATE tournaments SET modo_juego = 'neto'
  WHERE modo_juego = 'stableford';

UPDATE tournaments SET modo_juego = 'neto'
  WHERE modo_juego = 'match_play_neto';

-- ─── 3. Actualizar constraints ────────────────────────────────────────
ALTER TABLE rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_modo_juego_check;
ALTER TABLE rondas_libres ADD CONSTRAINT rondas_libres_modo_juego_check
  CHECK (modo_juego IN ('gross', 'neto'));

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_modo_juego_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_modo_juego_check
  CHECK (modo_juego IN ('gross', 'neto'));

-- ─── 4. formato_juego NOT NULL con default ────────────────────────────
-- Asegurar que todo registro tenga formato_juego
UPDATE rondas_libres SET formato_juego = 'stroke_play'
  WHERE formato_juego IS NULL;

UPDATE tournaments SET formato_juego = 'stroke_play'
  WHERE formato_juego IS NULL;

ALTER TABLE rondas_libres ALTER COLUMN formato_juego SET NOT NULL;
ALTER TABLE rondas_libres ALTER COLUMN formato_juego SET DEFAULT 'stroke_play';

ALTER TABLE tournaments ALTER COLUMN formato_juego SET NOT NULL;
ALTER TABLE tournaments ALTER COLUMN formato_juego SET DEFAULT 'stroke_play';

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — Idempotente. Después de esto:
--   modo_juego: solo 'gross' o 'neto'
--   formato_juego: 'stroke_play','stableford','match_play','best_ball','scramble','foursome'
-- ═══════════════════════════════════════════════════════════════════════════
```

- [ ] **Step 2: Ejecutar migración directamente vía Supabase Management API**

**IMPORTANTE:** Claude tiene `SUPABASE_ACCESS_TOKEN` en `.env.local` y ejecuta migraciones directamente. NUNCA pedir al usuario que vaya al Supabase Dashboard.

```bash
# Cargar el token y ejecutar el SQL vía API
node -e "
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/022_normalize_modo_juego.sql', 'utf8');
fetch('https://api.supabase.com/v1/projects/hoswfwhvcgqlqdmzpnce/database/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
}).then(r => r.json()).then(console.log);
"
```

O usar Supabase CLI si está linkeado:
```bash
npx supabase db push
```

- [ ] **Step 3: Verificar datos post-migración**

```sql
-- Verificar que no quedan valores híbridos
SELECT modo_juego, COUNT(*) FROM rondas_libres GROUP BY modo_juego;
-- Esperado: solo 'gross' y 'neto'

SELECT formato_juego, COUNT(*) FROM rondas_libres GROUP BY formato_juego;
-- Esperado: distribución de formatos

SELECT modo_juego, COUNT(*) FROM tournaments GROUP BY modo_juego;
-- Esperado: solo 'gross' y 'neto'
```

- [ ] **Step 4: Commit migración**

```bash
git add supabase/migrations/022_normalize_modo_juego.sql
git commit -m "fix(bd): normalizar modo_juego a solo gross/neto, formato_juego es fuente de verdad"
```

---

## Task 2: Actualizar tipos TypeScript — ModoJuego y FormatoJuego limpios

**Files:**
- Modify: `src/types/database.ts:5-7`
- Modify: `src/golf/core/rules.ts:7,14-88`
- Test: `src/__tests__/golf-rules-verification.test.ts` (actualizar)

- [ ] **Step 1: Actualizar tipos en database.ts**

```typescript
// src/types/database.ts líneas 5-7
// ANTES:
export type ModoJuego = 'gross' | 'neto' | 'stableford' | 'match_play_neto'
export type FormatoJuego = 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'

// DESPUÉS:
/** Modo de scoring: si el handicap entra en juego o no */
export type ModoJuego = 'gross' | 'neto'
/** Formato de competencia: cómo se estructura el juego */
export type FormatoJuego = 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'
```

También agregar `formato_juego` como campo requerido en la interface de RondaLibre si no lo está:

```typescript
// En la interface que corresponda, buscar la interface de rondas_libres
formato_juego: FormatoJuego  // requerido, no optional
```

- [ ] **Step 2: Actualizar rules.ts — ModoJuego y FORMAT_META**

```typescript
// src/golf/core/rules.ts
// Línea 7 — ANTES:
export type ModoJuego = 'gross' | 'neto' | 'stableford' | 'match_play_neto'

// DESPUÉS:
/** Modo de scoring: gross (sin handicap) o neto (con handicap) */
export type ModoJuego = 'gross' | 'neto'

// FORMAT_META.modosPermitidos — actualizar:
stroke_play: {
  // ...
  modosPermitidos: ['gross', 'neto'],  // ← era ['gross', 'neto'], OK
},
stableford: {
  // ...
  modosPermitidos: ['neto'],  // ← CAMBIAR de ['stableford'] a ['neto']
},
match_play: {
  // ...
  modosPermitidos: ['gross', 'neto'],  // ← CAMBIAR de ['gross', 'neto', 'match_play_neto']
},
best_ball: {
  // ...
  modosPermitidos: ['gross', 'neto'],  // ← CAMBIAR de ['gross', 'neto', 'stableford']
},
scramble: {
  // ...
  modosPermitidos: ['gross', 'neto'],  // ← CAMBIAR de ['gross', 'neto', 'stableford']
},
foursome: {
  // ...
  modosPermitidos: ['gross', 'neto'],  // ← OK, ya estaba así
},
```

NOTA: Stableford como formato SOLO permite modo neto. Best Ball y Scramble sí pueden ser gross o neto (stableford scoring es un formato, no un modo de best ball).

- [ ] **Step 3: Correr TypeScript — esperar MUCHOS errores**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Esto va a romper porque todos los archivos que comparan `modo_juego === 'stableford'` o `=== 'match_play_neto'` ya no son valores válidos del tipo. **Eso es exactamente lo que queremos** — TypeScript nos va a mostrar TODOS los lugares que necesitan refactoreo.

- [ ] **Step 4: Documentar la lista de errores TypeScript**

Guardar la lista de errores para usar como checklist en las siguientes tareas. No intentar arreglarlos todavía.

- [ ] **Step 5: Commit los tipos (broken state es OK para este commit intermedio)**

```bash
git add src/types/database.ts src/golf/core/rules.ts
git commit -m "refactor(tipos): ModoJuego ahora es solo gross/neto, FormatoJuego es la fuente de verdad

BREAKING: Este commit rompe TypeScript intencionalmente. Los siguientes commits
arreglan cada archivo que comparaba modo_juego con valores de formato."
```

---

## Task 3: Refactorear motor de scoring — separar formato de modo

**Files:**
- Modify: `src/golf/core/scoring.ts:145-163`
- Test: `src/__tests__/scoring.test.ts` (actualizar)

- [ ] **Step 1: Actualizar scorePrimario y ordenarJugadores**

```typescript
// src/golf/core/scoring.ts

import { type ModoJuego, type FormatoJuego, labelResultado } from './rules'

// ─── Score primario según formato y modo ───
export function scorePrimario(
  resumen: ResumenRonda,
  formato: FormatoJuego,
  modo: ModoJuego
): number {
  if (formato === 'stableford') return resumen.totalStableford
  if (modo === 'gross') return resumen.overUnderGross
  return resumen.overUnderNeto
}

// ─── Ordenar jugadores ───
export function ordenarJugadores<T extends {
  overUnderGross:  number
  overUnderNeto:   number
  totalStableford: number
}>(jugadores: T[], formato: FormatoJuego, modo: ModoJuego): T[] {
  return [...jugadores].sort((a, b) => {
    if (formato === 'stableford') return b.totalStableford - a.totalStableford
    const sa = modo === 'gross' ? a.overUnderGross : a.overUnderNeto
    const sb = modo === 'gross' ? b.overUnderGross : b.overUnderNeto
    return sa - sb
  })
}
```

- [ ] **Step 2: Actualizar tests de scoring**

```bash
npx vitest run src/__tests__/scoring.test.ts
```

Arreglar los tests que llamen a `scorePrimario` o `ordenarJugadores` con la firma vieja.

- [ ] **Step 3: Actualizar callers de scorePrimario/ordenarJugadores**

Buscar todos los callers:
```bash
grep -rn "scorePrimario\|ordenarJugadores" src/ --include="*.ts" --include="*.tsx"
```

Cada llamada ahora necesita 2 argumentos (formato, modo) en vez de 1 (modo_hibrido).

- [ ] **Step 4: Correr tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/golf/core/scoring.ts src/__tests__/
git commit -m "refactor(scoring): scorePrimario y ordenarJugadores reciben formato + modo separados"
```

---

## Task 4: Refactorear páginas — reemplazar modo_juego híbrido por formato_juego

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` (~25 cambios)
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` (~8 cambios)
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` (~5 cambios)

Esta es la tarea más grande. El patrón de cambio es simple y repetitivo:

**Regla de reemplazo:**
| Antes | Después |
|-------|---------|
| `ronda.modo_juego === 'match_play_neto'` | `ronda.formato_juego === 'match_play'` |
| `ronda.modo_juego === 'stableford'` | `ronda.formato_juego === 'stableford'` |
| `ronda.modo_juego !== 'match_play_neto'` | `ronda.formato_juego !== 'match_play'` |
| `modo_juego === 'neto' \|\| modo_juego === 'stableford'` | `modo_juego === 'neto'` (porque stableford ahora ES neto en BD) |

### Sub-pasos por archivo:

- [ ] **Step 1: Actualizar interface RondaLibre en los 3 archivos**

En cada archivo, la interface `RondaLibre` debe incluir `formato_juego`:

```typescript
interface RondaLibre {
  // ... campos existentes ...
  modo_juego: ModoJuego       // ahora solo 'gross' | 'neto'
  formato_juego: FormatoJuego // 'stroke_play' | 'stableford' | 'match_play' | ...
}
```

Y los queries de Supabase deben incluir `formato_juego` en el `.select()`:

```typescript
.select('id, codigo, ..., modo_juego, formato_juego, ...')
```

- [ ] **Step 2: Reemplazar en page.tsx (espectador) — 25 cambios**

Usar find-and-replace con contexto:

```
ronda.modo_juego === 'match_play_neto'  →  ronda.formato_juego === 'match_play'
ronda.modo_juego === 'stableford'       →  ronda.formato_juego === 'stableford'
ronda.modo_juego !== 'match_play_neto'  →  ronda.formato_juego !== 'match_play'
```

Para labels de display:
```typescript
// ANTES:
{ronda.modo_juego === 'match_play_neto' ? 'Match Play Neto'
 : ronda.modo_juego === 'stableford' ? 'Stableford'
 : ronda.modo_juego === 'neto' ? `Stroke Play Neto · ${ronda.holes}h`
 : `Stroke Play · ${ronda.holes}h`}

// DESPUÉS:
{(() => {
  const formatLabel = ronda.formato_juego === 'match_play' ? 'Match Play'
    : ronda.formato_juego === 'stableford' ? 'Stableford'
    : ronda.formato_juego === 'best_ball' ? 'Best Ball'
    : ronda.formato_juego === 'scramble' ? 'Scramble'
    : ronda.formato_juego === 'foursome' ? 'Foursome'
    : 'Stroke Play'
  const modoLabel = ronda.modo_juego === 'neto' ? 'Neto' : 'Gross'
  // Stableford siempre es neto, no necesita decir "Neto"
  if (ronda.formato_juego === 'stableford') return 'Stableford'
  return `${formatLabel} ${modoLabel}`
})()}
```

- [ ] **Step 3: Reemplazar en score/page.tsx — 8 cambios**

Mismo patrón. La línea 698 `const isMatchPlay = ronda?.modo_juego === 'match_play_neto'` cambia a:
```typescript
const isMatchPlay = ronda?.formato_juego === 'match_play'
```

- [ ] **Step 4: Reemplazar en score-grupo/page.tsx — 5 cambios**

Mismo patrón. El `modoLabel` cambia a usar `formato_juego`:
```typescript
const modoLabel = ronda.formato_juego === 'match_play' ? 'Match Play'
  : ronda.formato_juego === 'stableford' ? 'Stableford'
  : 'Stroke Play'
const modoSuffix = ronda.formato_juego !== 'stableford'
  ? (ronda.modo_juego === 'neto' ? ' Neto' : ' Gross')
  : ''
// Display: `${modoLabel}${modoSuffix}`
```

- [ ] **Step 5: Correr TypeScript + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/app/ronda-libre/
git commit -m "refactor(ui): usar formato_juego en vez de modo_juego para detectar formato de competencia"
```

---

## Task 5: UI de creación — selector Gross/Neto separado del formato

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx:91,274-282,770-780`
- Modify: `src/app/organizador/nuevo/NuevoTorneoForm.tsx:27-29,202`

- [ ] **Step 1: Agregar state de modo en nueva/page.tsx**

```typescript
// Después de: const [formato, setFormato] = useState<FormatoJuego>('stroke_play')
const [modo, setModo] = useState<'gross' | 'neto'>('neto')
```

- [ ] **Step 2: Agregar selector Gross/Neto en el UI**

Después del selector de formato, agregar toggle de modo:

```tsx
{/* Selector Gross/Neto — solo si el formato lo permite */}
{formato !== 'stableford' && (
  <div style={{ marginTop: '16px' }}>
    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: 600 }}>
      Modo de scoring
    </div>
    <div style={{ display: 'flex', gap: '8px' }}>
      {[
        { value: 'neto' as const, label: 'Neto', desc: 'Con handicap' },
        { value: 'gross' as const, label: 'Gross', desc: 'Sin handicap' },
      ].map(m => {
        const active = modo === m.value
        return (
          <button key={m.value} onClick={() => setModo(m.value)} style={{
            flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
            background: active ? 'rgba(196,153,42,0.12)' : '#f9fafb',
            outline: active ? '2px solid #c4992a' : '1px solid #e5e7eb',
            cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: active ? '#c4992a' : '#374151' }}>
              {m.label}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{m.desc}</div>
          </button>
        )
      })}
    </div>
  </div>
)}
{formato === 'stableford' && (
  <div style={{
    marginTop: '12px', padding: '10px 14px', borderRadius: '8px',
    background: 'rgba(196,153,42,0.06)', fontSize: '12px', color: '#6b7280',
  }}>
    Stableford siempre se juega con handicap (neto)
  </div>
)}
```

- [ ] **Step 3: Forzar neto cuando se selecciona stableford**

```typescript
// En el onClick del selector de formato:
if (f.value === 'stableford') setModo('neto')
```

- [ ] **Step 4: Actualizar la lógica de creación (líneas 274-282)**

```typescript
// ANTES:
const modoJuego = formato === 'match_play' ? 'match_play_neto'
  : formato === 'stableford' ? 'stableford' : 'neto'
const formatoJuego = formato === 'match_play' ? 'match_play'
  : formato === 'stableford' ? 'stableford' : formato

// DESPUÉS:
const modoJuego = formato === 'stableford' ? 'neto' : modo
const formatoJuego = formato
// Listo. Limpio, simple, correcto.
```

- [ ] **Step 5: Aplicar mismo cambio en NuevoTorneoForm.tsx**

Agregar selector de modo y formato separados. Cambiar línea 202:

```typescript
// ANTES:
.insert({ ...tournamentBase, modo_juego: 'gross' })

// DESPUÉS:
.insert({ ...tournamentBase, modo_juego: modo, formato_juego: formato })
```

- [ ] **Step 6: Correr TypeScript + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx src/app/organizador/nuevo/NuevoTorneoForm.tsx
git commit -m "feat(ui): selector Gross/Neto separado del formato de competencia"
```

---

## Task 6: Refactorear GWI, stats, y componentes auxiliares

**Files:**
- Modify: `src/golf/stats/gwi.ts` — cambiar modoJuego type
- Modify: `src/components/GWILeaderboard.tsx` — prop type
- Modify: `src/components/MiniLeaderboard.tsx` — si usa modo_juego
- Modify: `src/components/MatchStatusBar.tsx` — si referencia modo
- Modify: `src/app/api/gwi/ronda-libre/[codigo]/route.ts` — tipo

- [ ] **Step 1: Actualizar gwi.ts**

```typescript
// ANTES:
modoJuego: ModoJuego  // aceptaba 'stableford', 'match_play_neto'

// DESPUÉS:
modoJuego: ModoJuego       // solo 'gross' | 'neto'
formatoJuego: FormatoJuego  // 'stableford' etc
```

Internamente, donde dice `esStableford = jugadores[0].modoJuego === 'stableford'`, cambiar a `formatoJuego === 'stableford'`.

- [ ] **Step 2: Actualizar GWI API route**

```typescript
// ANTES:
const modo = (ronda.modo_juego as 'gross' | 'neto' | 'stableford') || 'gross'

// DESPUÉS:
const modo = ronda.modo_juego as ModoJuego  // ya es 'gross' | 'neto'
const formato = ronda.formato_juego as FormatoJuego
```

- [ ] **Step 3: Actualizar componentes que reciben modoJuego prop**

Buscar todos los componentes que reciben `modoJuego` como prop y agregar `formatoJuego` donde sea necesario.

- [ ] **Step 4: Correr TypeScript + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/golf/stats/ src/components/ src/app/api/gwi/
git commit -m "refactor(stats): GWI y componentes auxiliares usan formato_juego + modo_juego separados"
```

---

## Task 7: Limpiar countback, API routes, y últimas referencias

**Files:**
- Modify: `src/golf/core/countback.ts` — si usa ModoJuego
- Modify: `src/app/api/game/route.ts` — si referencia modo_juego híbrido
- Modify: cualquier archivo que aún tenga errores TypeScript

- [ ] **Step 1: Correr TypeScript y arreglar todo lo restante**

```bash
npx tsc --noEmit 2>&1
```

Arreglar CADA error. No debe quedar ninguno.

- [ ] **Step 2: Correr TODOS los tests**

```bash
npx vitest run
```

Todos deben pasar. Si algún test comparaba con `'stableford'` o `'match_play_neto'` como ModoJuego, actualizarlo.

- [ ] **Step 3: Build de producción**

```bash
npm run build
```

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "refactor(limpieza): eliminar todas las referencias a modo_juego híbrido

Después de este commit:
- ModoJuego = 'gross' | 'neto' en TODA la app
- FormatoJuego = fuente de verdad para el formato de competencia
- No quedan comparaciones con 'stableford' o 'match_play_neto' en modo_juego
- 0 errores TypeScript, todos los tests pasan, build exitoso"
```

---

## Task 8: Verificación E2E y scanner de conceptos

**Files:**
- Modify: `src/__tests__/golf-rules-verification.test.ts` — agregar tests de separación

- [ ] **Step 1: Agregar tests de concepto**

```typescript
describe('Separación Formato vs Modo', () => {
  it('ModoJuego solo tiene gross y neto', () => {
    type AssertModo = ModoJuego extends 'gross' | 'neto' ? true : false
    const check: AssertModo = true
    expect(check).toBe(true)
  })

  it('Stableford es un formato, no un modo', () => {
    const formatos: FormatoJuego[] = ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome']
    expect(formatos).toContain('stableford')

    // ModoJuego NO contiene 'stableford'
    const modos: ModoJuego[] = ['gross', 'neto']
    expect(modos).not.toContain('stableford' as any)
  })

  it('FORMAT_META.stableford solo permite modo neto', () => {
    expect(FORMAT_META.stableford.modosPermitidos).toEqual(['neto'])
  })

  it('FORMAT_META.match_play permite gross y neto', () => {
    expect(FORMAT_META.match_play.modosPermitidos).toContain('gross')
    expect(FORMAT_META.match_play.modosPermitidos).toContain('neto')
  })
})
```

- [ ] **Step 2: Verificación manual de flujo completo**

1. Crear ronda Stroke Play Gross → verificar que `modo_juego = 'gross'` y `formato_juego = 'stroke_play'`
2. Crear ronda Stroke Play Neto → verificar `modo_juego = 'neto'` y `formato_juego = 'stroke_play'`
3. Crear ronda Stableford → verificar `modo_juego = 'neto'` y `formato_juego = 'stableford'`
4. Crear ronda Match Play → elegir Gross o Neto → verificar ambos campos correctos
5. Ver espectador de cada modalidad → labels correctos

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/golf-rules-verification.test.ts
git commit -m "test(conceptos): verificar separación formato vs modo en toda la app"
```

---

## Orden de ejecución

```
Task 1 (BD) ──→ Task 2 (tipos) ──→ Task 3 (scoring) ──→ Task 4 (páginas) ──→ Task 5 (UI creación)
                                                                                       ↓
                                                              Task 7 (limpieza) ←── Task 6 (GWI/stats)
                                                                       ↓
                                                              Task 8 (verificación)
```

**IMPORTANTE:** Task 1 (migración) se ejecuta en Supabase PRIMERO. El frontend viejo sigue funcionando porque todavía lee `modo_juego` (ahora normalizado a 'gross'/'neto') y las comparaciones `=== 'stableford'` simplemente no matchean (muestran stroke play como fallback). No ideal pero no se cae.

Tasks 2-4 son el bloque crítico donde TypeScript se rompe y se arregla. Es un refactor en cadena.

Task 5 es el user-facing change (selector Gross/Neto).

Tasks 6-7 son limpieza.

Task 8 es verificación final.

## Verificación final post-implementación

1. `npx tsc --noEmit` — 0 errores
2. `npx vitest run` — todos pasan
3. `npm run build` — build exitoso
4. `grep -rn "'stableford'" src/ --include="*.ts" --include="*.tsx"` — solo debe aparecer en comparaciones con `formato_juego`, NUNCA con `modo_juego`
5. `grep -rn "'match_play_neto'" src/ --include="*.ts" --include="*.tsx"` — CERO resultados
