# Tarjetas del Índice FedeGolf — Spec + Plan Fase 1

> **Estado:** BORRADOR para revisión de Juanjo. No implementar hasta OK.
> **Fecha:** 2026-07-21 · **Autor:** Claude (CTO)
> **Investigación previa:** este documento asume el spike ya cerrado (auth `lva` + `consultaPalosMasivo`/`listadoMejoresPalos` verificados en vivo con la cuenta real de Juanjo). Ver memoria `project_fedegolf_pendientes_manana` §2.

**Goal:** Espejar en Golfers+ las ~20 tarjetas oficiales que componen el índice FedeGolf de un usuario vinculado, guardándolas como rondas de su historial, deduplicadas, con la modalidad chilena de campeonato (×2) respetada — actualizándose solo en cada sync.

**Architecture:** Login de página server-side (form `/` con token `lva`, sin navegador) → fetch de `listadoMejoresPalos.php` → parseo de las 20 tarjetas → filtro de sanidad + detección de campeonato → upsert en `historical_rounds` deduplicado por `fedegolf_ticket`. Todo en un endpoint **independiente y fail-soft**, desacoplado del sync de índice existente.

**Tech Stack:** Next.js 14 API route (`force-dynamic`), `fetch` nativo (sin Playwright en prod), Supabase (`historical_rounds`, `fedegolf_credentials`), crypto AES-256-GCM ya existente.

---

## 1. Objetivo y ancla del primer release

El objetivo NO es "traer tarjetas". Es convertir el índice de un número muerto en un sistema **explicado, oficial y proyectable**. Las 20 tarjetas son el dataset mínimo (se auto-refresca, ≈20 filas) que desbloquea, en orden de valor:

1. **Índice explicado y oficial** — mostrar las 8 tarjetas que cuentan, cuadrado al decimal con fedegolf.cl. *(← ANCLA de la Fase 1/2)*
2. **Proyección accionable** — "con un diferencial ≤ 7.0 bajas a 9.0". *(Fase 3)*
3. **Live scorer con proyección oficial** — "si terminas en 84, tu índice queda en 9.0". *(Fase 3)*
4. **Cross-validación del motor** — diffs oficiales como ground truth vs `indice_golfers`. *(subproducto)*
5. **Contexto de competitividad para el coach** — la bandera de campeonato. *(subproducto)*

**Decisión de ancla (CTO):** el primer release visible es el **objetivo #1**. La Fase 1 (este plan) construye la **base de datos** que lo habilita — sin ella, ninguno de los 5 existe. Proyección (#2/#3) queda para fases siguientes, ya con los datos en casa.

## 2. Alcance

**Release 1 = Fase 1 (datos) + Fase 2 (UI índice oficial explicado), se shippean JUNTOS (D8).**

**Dentro (Fase 1 — datos):**
- Nuevas funciones de cliente FedeGolf: `fedegolfPageLogin`, `fedegolfGetTarjetasIndice`.
- Parseo + filtro por diferencial + detección de campeonato ×2 + detección de 9h.
- Migración: `historical_rounds` gana `fedegolf_ticket`, `vale_doble`, y `'fedegolf'` en el CHECK de `import_source`.
- Captura idempotente con `excluded_from_handicap=TRUE` (upsert por ticket) + endpoint independiente `POST /api/fedegolf/sync-tarjetas`.
- Trigger client-side (extender `FedegolfSync.tsx`, fail-soft).

**Dentro (Fase 2 — UI, mismo release):**
- Vista/modal "Índice oficial FedeGolf": las 20 tarjetas + las 8 que cuentan (re-derivadas del fetch) + promedio = índice oficial, cuadrado con fedegolf.cl. Badge "Campeonato ×2" en las `vale_doble`.
- **Las tarjetas FedeGolf NO aparecen en el listado genérico de scorecards del historial** (D8) — solo en esta vista.
- La UI pasa por el pipeline de diseño (design-shotgun → frontend-design → design-review) cuando se construya.

**Fuera (parqueado / Fase 3):**
- Historial completo de 9 años (`consultaPalosMasivo`) — PARQUEADO.
- Merge con Garmin (hoyo-a-hoyo) — PARQUEADO.
- Proyección "¿qué diff necesito para bajar?" + scorer en vivo — Fase 3.
- Recomputar el índice — **nunca**; el número oficial manda.

## 3. Decisiones de diseño (no negociables)

| # | Decisión | Razón |
|---|---|---|
| D1 | **Identidad de tarjeta = `ticket`.** Dedup por `(user_id, fedegolf_ticket)`. Fallback `(course_name, played_at, total_gross, diferencial)` solo cuando el ticket falta **y no hay gemela** (ver D2). | Los tickets son únicos y crecientes; detección de nuevas por ticket, **nunca por fecha** (la fecha de ingreso va desfasada hasta meses). |
| D2 | **Campeonato ×2 = una ronda física, dos casillas de índice.** En la vista de 20, la fila **sin ticket** con gemela **ticketeada** (misma fecha+cancha+gross+diff) NO es una ronda: es el marcador de doblaje. Se descarta como ronda y se marca `vale_doble = true` en la gemela. | Verificado: el campeonato aparece 1× en el historial completo y 2× en la vista de índice (la 2ª sin ticket). Modalidad chilena: torneos valen por 2. |
| D3 | **Filtro de sanidad = por DIFERENCIAL ∈ [−10, +54]** (primario). El gross es señal secundaria (flag, **no** rechazo). | Verificado: 13/204 tarjetas 2017-2018 de Juanjo son basura, **todas con diff −45 a −59** → el filtro por diferencial las caza. **NO filtrar por gross**: una ronda legítima de 9h tiene gross ~45 y sería descartada por error; su diferencial (ya escalado a 18h por la fede) es normal. |
| D4 | **Captura independiente del sync de índice.** Endpoint propio, try/catch aislado. Si se rompe, el índice sigue sincronizando. | CERO FALLOS: sin cascada. |
| D5 | **No recomputar índice.** Guardamos las tarjetas y sus diffs oficiales; el número mostrado sigue siendo `profiles.indice` (oficial). En cada sync **refrescamos** los diffs de las 20 vigentes. | El oficial es la verdad; recalcular introduce discrepancias. |
| D6 | **`import_source = 'fedegolf'`** para toda tarjeta importada así. `privacy = 'private'`. | Trazabilidad + separa de Garmin/manual para dedup y UI. |
| **D7** | **`excluded_from_handicap = TRUE`** en TODA tarjeta FedeGolf. | La RPC `calcular_indice_golfers` filtra solo por este flag (**NO** por `import_source`, verificado en `20260521_excluded_from_handicap.sql:38`). Sin esto, las tarjetas oficiales **contaminarían** el `indice_golfers`: doble conteo vs Garmin/manual + divergencia por campeonato (la fede cuenta el campeonato como 2 diffs, nosotros guardamos 1 ronda). El número oficial vive en `profiles.indice` y no se recalcula. `excluded_from_handicap` significa exactamente "ronda que mostramos pero de la que no calculamos NUESTRO índice". |
| **D8** | **Release 1 = datos (Fase 1) + vista "Índice oficial explicado" (Fase 2), juntos.** Las tarjetas FedeGolf **NO** se muestran en el listado genérico de scorecards del historial en v1 (son score-only → se verían en blanco); su hogar es la vista dedicada de índice oficial. | Evita que la Fase 1 sola ensucie el historial con ~20 tarjetas flacas sin el contexto que las justifica. |

## 4. Modelo de datos

Cambios a `historical_rounds` (tabla dashboard-created; solo `ALTER`):

```sql
-- migración: supabase/migrations/20260721_historical_rounds_fedegolf_tarjetas.sql

-- 1. permitir import_source = 'fedegolf'
ALTER TABLE historical_rounds DROP CONSTRAINT IF EXISTS historical_rounds_import_source_check;
ALTER TABLE historical_rounds ADD CONSTRAINT historical_rounds_import_source_check
  CHECK (import_source IN ('manual','ronda_libre','photo_scan','garmin','csv','import','fedegolf'));

-- 2. columnas nuevas
ALTER TABLE historical_rounds ADD COLUMN IF NOT EXISTS fedegolf_ticket TEXT;
ALTER TABLE historical_rounds ADD COLUMN IF NOT EXISTS vale_doble BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. dedup fuerte por ticket (índice único parcial — completo, no filtrado por otra cosa)
CREATE UNIQUE INDEX IF NOT EXISTS ux_historical_rounds_user_ticket
  ON historical_rounds (user_id, fedegolf_ticket)
  WHERE fedegolf_ticket IS NOT NULL;
```

> **Nota de build:** confirmar el nombre real del CHECK constraint (`003_historical_rounds_import.sql`) antes de correr; el `DROP ... IF EXISTS` cubre el caso de nombre distinto pero hay que verificar que quede uno solo.

`vale_doble` de momento es **informativo** (badge + contexto coach). NO se toca la RPC `calcular_indice_golfers` en Fase 1 — no recomputamos (D5). La lógica de "una ronda de campeonato aporta 2 diferenciales" solo aplicaría si algún día calculamos índice desde estas tarjetas (fuera de alcance).

Tipos TS nuevos en `src/lib/fedegolf/types.ts`:

```ts
export interface FedegolfTarjeta {
  fechaJuego: string          // 'YYYY-MM-DD' (fecha de juego, NO de ingreso)
  clubCancha: string          // 'C.G. Los Leones / Los Leones (VARONES)'
  scoreGross: number          // 84
  courseRating: number        // 73.3
  slope: number               // 136
  tee: string | null          // 'Azul' (normalizado; 'A' → 'Azul')
  diferencial: number         // 8.8
  ticket: string | null       // '6902341' | null (marcador de doblaje)
  cuenta: boolean             // true si es una de las 8 (class="selected-row")
  holes: 9 | 18 | null        // detectado si es posible; null = desconocido (NO asumir 18)
}
```

> **`cuenta` NO se persiste** (varía en cada sync — depende de las últimas 20). La vista de índice oficial (Fase 2) lo re-deriva del fetch en vivo, no de un campo guardado.

## 5. Registro de edge cases (verificados en data real → regla)

| Edge | Verificado | Regla |
|---|---|---|
| Campeonato ×2 (fila sin ticket) | Sí (#18/#19 de Juanjo) | D2 |
| Detección por fecha rompe (ingreso desfasado 73% de casos) | Sí | Dedup/detección solo por ticket (D1) |
| Tee truncado ("A" vs "Azul") | Sí | `normalizarTee()` |
| Slope con formato mixto ("136.0"/"136") | Sí | `parseFloat` tolerante |
| 13 tarjetas basura (diff −45 a −59) | Sí (fuera de ventana) | Filtro por diferencial (D3) |
| Rondas de 9 hoyos (DAMAS / cortas) | Parcial (tus 20 son 18h) | Detectar 9h; **no** hardcodear `holes_played=18`; el filtro por gross las mataría → por eso D3 filtra por diff. Como son `excluded_from_handicap`, `holes_played` no alimenta ningún cálculo nuestro (se guarda por fidelidad, no por necesidad) |
| Scorecard en blanco (sin hoyo-a-hoyo) | Sí | No mostrar tarjetas FedeGolf en el listado genérico del historial (D8); van a la vista dedicada de índice oficial |
| Canchas de otros clubes/extranjeras | Sí (14 canchas) | La tarjeta ya trae CR+slope; si no matchea catálogo → `course_id = null`, `course_name` crudo |
| Cambio de clave FedeGolf | — | Login falla → marcar `activo=false`, no romper (patrón ya existe en sync-indice) |
| Cambio del esquema `lva` | — | Fail-soft + captureError a Sentry |
| Doble conteo vs Garmin/manual | — | Dedup al insertar: si ya hay ronda `(course_name, played_at, total_gross)` de otra fuente, no duplicar (D6 permite distinguir por `import_source`) |

---

## Plan de implementación — Fase 1

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans. Steps con checkbox.

**Estructura de archivos:**
- Crear: `src/lib/fedegolf/page-login.ts` (login `lva`)
- Crear: `src/lib/fedegolf/tarjetas.ts` (fetch + parse + filtro + campeonato)
- Modificar: `src/lib/fedegolf/types.ts` (tipo `FedegolfTarjeta`)
- Crear: `src/lib/fedegolf/capturar-tarjetas.ts` (mapeo → upsert `historical_rounds`)
- Crear: `supabase/migrations/20260721_historical_rounds_fedegolf_tarjetas.sql`
- Crear: `src/app/api/fedegolf/sync-tarjetas/route.ts` (endpoint independiente)
- Modificar: `src/components/FedegolfSync.tsx` (disparar sync-tarjetas, fail-soft)
- Tests: `src/lib/fedegolf/tarjetas.test.ts`, `capturar-tarjetas.test.ts`, `page-login.test.ts`

### Task 1: `fedegolfPageLogin` (login de página con `lva`)

**Files:** Create `src/lib/fedegolf/page-login.ts`, Test `src/lib/fedegolf/page-login.test.ts`

- [ ] **Step 1 — Test (falla):** mock de `fetch`: GET `/` devuelve HTML con `<input name="lva" value="a0329906383471798d4e5f633c66a848">` + Set-Cookie PHPSESSID; POST `/` devuelve 200. Assert que `fedegolfPageLogin('19686463-6','x')` retorna `{ cookie: 'PHPSESSID=...' }` y que el POST envió body `lva=a032...&rut=...&pass=...&aceptar=Ingresar` con `Content-Type: application/x-www-form-urlencoded`.
- [ ] **Step 2 — Correr, verificar fallo** (`function not defined`).
- [ ] **Step 3 — Implementar** (código probado en el spike):

```ts
import type { FedegolfSession } from './types'
const BASE = 'https://www.fedegolf.cl'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

function extractPhpSessionId(headers: Headers): string | null {
  const cookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie() : (headers.get('set-cookie')?.split(', ') ?? [])
  for (const c of cookies) { const m = c.match(/PHPSESSID=([^;]+)/); if (m) return m[1] }
  return null
}

/** Login de PÁGINA (distinto del services.php de fedegolfLogin): form POST a `/`
 *  con el token `lva`. Único que autoriza las páginas admin/publico (tarjetas). */
export async function fedegolfPageLogin(rut: string, password: string): Promise<FedegolfSession> {
  const init = await fetch(`${BASE}/`, { redirect: 'manual', headers: { 'User-Agent': UA } })
  const sid = extractPhpSessionId(init.headers)
  const html = await init.text()
  const lva = html.match(/name=["']lva["'][^>]*value=["']([^"']+)["']/i)?.[1]
           ?? html.match(/value=["']([a-f0-9]{32})["'][^>]*name=["']lva["']/i)?.[1]
  if (!sid || !lva) throw new Error('fedegolf: no se pudo obtener PHPSESSID/lva para login de página')
  const res = await fetch(`${BASE}/`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `PHPSESSID=${sid}`, 'User-Agent': UA, Origin: BASE, Referer: `${BASE}/` },
    body: new URLSearchParams({ lva, rut, pass: password, aceptar: 'Ingresar' }).toString(),
  })
  const newSid = extractPhpSessionId(res.headers)
  return { cookie: `PHPSESSID=${newSid ?? sid}` }
}
```

- [ ] **Step 4 — Correr, verificar PASS.**
- [ ] **Step 5 — Commit:** `feat(fedegolf): login de página con token lva para acceso a tarjetas`

### Task 2: parser + filtro + campeonato (`fedegolfGetTarjetasIndice`)

**Files:** Modify `src/lib/fedegolf/types.ts` (tipo `FedegolfTarjeta`), Create `src/lib/fedegolf/tarjetas.ts`, Test `src/lib/fedegolf/tarjetas.test.ts`

- [ ] **Step 1 — Test (falla):** fixture HTML real (guardar `listado-full.html` del spike como fixture en `src/lib/fedegolf/__fixtures__/listado-20.html`). Assert:
  - `parseTarjetas(html)` retorna 20 filas crudas.
  - Fila #1: `{ fechaJuego:'2026-07-11', scoreGross:84, courseRating:73.3, slope:136, tee:'Azul', diferencial:8.8, ticket:'6902341', cuenta:true }`.
  - `resolverCampeonatos(filas)`: el par (#18 sin ticket / #19 ticket 6766119) colapsa a **1 tarjeta** con `ticket:'6766119'`, `valeDoble:true`; la sin-ticket se descarta.
  - `filtrarSanidad`: una fila mock **diff=-49 se descarta**; una fila mock gross=45/diff=12 (9h legítima) **se conserva** (no rechazar por gross).
  - `normalizarTee('A') === 'Azul'`.
  - `holes`: si el HTML no da señal clara de 9/18 → `null` (nunca asumir 18).
- [ ] **Step 2 — Correr, verificar fallo.**
- [ ] **Step 3 — Implementar** `src/lib/fedegolf/tarjetas.ts`:
  - `parseTarjetas(html)`: regex `<tr class="?([^">]*)"?>...<td>` → columnas `Nro|Fecha|Club/Cancha|Score|Course|Slope|Tee|Diff|Ticket`; `cuenta = clase incluye 'selected-row'`; ticket en la penúltima celda (la última es vacía).
  - `normalizarTee(raw)`: `{A:'Azul',B:'Blanco',R:'Rojo',N:'Negro',D:'Dorado'}[raw[0]] ?? raw ?? null`.
  - `filtrarSanidad(t)`: **solo** `t.diferencial>=-10 && t.diferencial<=54` (D3 — el diff caza las 13 basura sin descartar 9h legítimo). El gross se guarda tal cual.
  - `detectarHoles(fila)`: usar cualquier marca de 9/18 del HTML; si no hay señal, `null`.
  - `resolverCampeonatos(filas)`: agrupar por `fechaJuego|clubCancha|scoreGross|diferencial`; si un grupo tiene 2 y una es ticketless → quedarse con la ticketeada, `valeDoble=true`, descartar la ticketless. Grupos de 1 → `valeDoble=false`.
  - `fedegolfGetTarjetasIndice(session)`: GET `${BASE}/publico/modVeinteMejoresPalos/listadoMejoresPalos.php` con `Cookie: session.cookie`; `parseTarjetas` → `filtrarSanidad` → `resolverCampeonatos`. (GET auto-scopea al socio logueado — verificado; no necesita club/usuario.)
- [ ] **Step 4 — Correr, verificar PASS.**
- [ ] **Step 5 — Commit:** `feat(fedegolf): fetch y parseo de las 20 tarjetas del índice (+ campeonato ×2 + filtro)`

### Task 3: migración de esquema

**Files:** Create `supabase/migrations/20260721_historical_rounds_fedegolf_tarjetas.sql`

- [ ] **Step 1 — Escribir migración** (SQL de §4).
- [ ] **Step 2 — Verificar nombre del CHECK** contra `003_historical_rounds_import.sql` y ajustar el `DROP CONSTRAINT`.
- [ ] **Step 3 — Aplicar en prod** vía `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/20260721_historical_rounds_fedegolf_tarjetas.sql`.
- [ ] **Step 4 — Verificar** columnas + índice único con un `SELECT` a `information_schema`.
- [ ] **Step 5 — Commit:** `feat(db): historical_rounds acepta tarjetas fedegolf (ticket + vale_doble)`

### Task 4: captura idempotente (`capturarTarjetas`)

**Files:** Create `src/lib/fedegolf/capturar-tarjetas.ts`, Test `capturar-tarjetas.test.ts`

- [ ] **Step 1 — Test (falla):** con un cliente Supabase mock, dado un set de `FedegolfTarjeta`:
  - inserta N filas en `historical_rounds` con `import_source:'fedegolf'`, **`excluded_from_handicap: true`** (D7 — NO alimenta `indice_golfers`), `played_at=fechaJuego`, `total_gross`, `course_rating`, `slope_rating`, `diferencial`, `fedegolf_ticket`, `vale_doble`, `holes_played: tarjeta.holes` (puede ser null), `privacy:'private'`.
  - **assert crítico:** verificar que tras la captura, un `SELECT` a la RPC `calcular_indice_golfers` NO cambia (las tarjetas FedeGolf no deben mover el índice Golfers+).
  - re-ejecutar con las mismas tarjetas → **0 inserts nuevos** (upsert por `(user_id, fedegolf_ticket)`).
  - una tarjeta con diff cambiado (reproceso) → **UPDATE** del diff existente, no insert.
  - dedup cross-source: si ya existe `(course_name, played_at, total_gross)` con `import_source != 'fedegolf'` → no duplicar (se salta, o se linkea el ticket — decidir en build; default: saltar).
- [ ] **Step 2 — Correr, verificar fallo.**
- [ ] **Step 3 — Implementar** `capturarTarjetas(supabase, userId, tarjetas)`: `upsert` con `onConflict: 'user_id,fedegolf_ticket'` para las que tienen ticket; para las (raras) sin ticket sin gemela, dedup manual por `(course_name, played_at, total_gross)`. Mapear `clubCancha` → `course_name` (crudo) + intentar `matchCourseInDB` para `course_id` (best-effort, null si no matchea).
- [ ] **Step 4 — Correr, verificar PASS.**
- [ ] **Step 5 — Commit:** `feat(fedegolf): captura idempotente de tarjetas en historical_rounds`

### Task 5: endpoint `POST /api/fedegolf/sync-tarjetas`

**Files:** Create `src/app/api/fedegolf/sync-tarjetas/route.ts`

- [ ] **Step 1 — Test/smoke:** describir el flujo (auth → cargar `fedegolf_credentials` → cooldown propio 24h → decrypt → `fedegolfPageLogin` → `fedegolfGetTarjetasIndice` → `capturarTarjetas` → responder `{ ok, capturadas, actualizadas }`).
- [ ] **Step 2 — Implementar** espejando `sync-indice/route.ts` (mismo patrón de creds/decrypt/cooldown/`activo=false` on fail), `force-dynamic`, TODO envuelto en try/catch que responde `{ ok:false }` sin 500 (D4).
- [ ] **Step 3 — Verificar** contra prod con la cuenta de Juanjo (debe capturar ~19 tarjetas, 1 campeonato marcado `vale_doble`, 0 basura).
- [ ] **Step 4 — Commit:** `feat(fedegolf): endpoint sync-tarjetas independiente y fail-soft`

### Task 6: trigger client-side

**Files:** Modify `src/components/FedegolfSync.tsx`

- [ ] **Step 1 — Implementar:** tras el `fetch('/api/fedegolf/sync-indice')` existente, disparar (independiente, sin await encadenado que bloquee) `fetch('/api/fedegolf/sync-tarjetas', { method:'POST' })`, fire-and-forget, errores silenciados.
- [ ] **Step 2 — Verificar** en preview que ambos disparan y ninguno rompe al otro.
- [ ] **Step 3 — Commit:** `feat(fedegolf): FedegolfSync dispara captura de tarjetas (fail-soft)`

### Cierre Fase 1
- [ ] `/pre-push` completo (tsc + tests + build + health).
- [ ] `superpowers:code-reviewer` sobre el diff (>100 LOC).
- [ ] Verificación en prod con cuenta real: 19 tarjetas, campeonato marcado, basura filtrada, re-sync idempotente.
- [ ] Doc: `docs/SPRINT_LOG.md` + actualizar memoria `project_fedegolf_pendientes_manana`.

---

## Fase 2 (mismo release — tasks a expandir antes de shippear)

- **Vista "Índice oficial FedeGolf" (ancla visible #1):** 20 tarjetas + las 8 que cuentan (re-derivadas del fetch, no de un flag guardado) + promedio = índice oficial, cuadrado con fedegolf.cl. Reusar patrón de `IndiceBreakdownModal.tsx` / `DualIndexCards.tsx`. Badge "Campeonato ×2" en las `vale_doble`. Pasa por design-shotgun → frontend-design → design-review.

## Fase 3 (futura)

- **Proyección + live scorer (#2/#3):** motor "¿qué diferencial necesito para bajar a X?" sobre la ventana de 20; en el scorer (`ronda-libre/[codigo]/score`) proyección en vivo "si terminas en Y, tu índice queda en Z".

---

## Riesgos abiertos (a validar con Juanjo antes de escalar)

| Riesgo | Detalle | Estado |
|---|---|---|
| **ToS / rate-limit** | Cada app-open dispara un login automático a fedegolf.cl por usuario. A escala: riesgo de baneo de IP o violación de términos (scraping automatizado con credenciales de socio). Mitigación parcial: cooldown 24h + IPs rotativas de Vercel. | **Abierto** — validar antes de rollout masivo. Ya existe para el sync de índice; esto lo profundiza. |
| **Seguridad de credenciales** | Guardamos la clave FedeGolf de cada usuario en forma **reversible** (AES-256-GCM, no hash — necesitamos el texto plano para loguear). Brecha de DB + `FEDEGOLF_ENCRYPTION_KEY` expone claves de federación (muchos usuarios las reusan). | **Pre-existente** — no lo introduce esta feature, pero aumenta la dependencia. Revisar en próximo security audit. |
| **Dedup cross-source** | Una tarjeta FedeGolf y su gemela de Garmin/manual pueden no matchear por nombre de cancha distinto → aparecerían dos veces en la vista (no en el índice, que está excluido). | **Menor** — solo afecta display, no cálculo. |
