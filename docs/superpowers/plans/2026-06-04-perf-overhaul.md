# Performance Overhaul — Plan

> Worktree: `fix/perf-overhaul-claude`. Baseline 2026-06-04: landing TTFB 1.68s; dashboard/coach detrás de login con waterfall client-side.

**Goal:** App rápida al abrir y al navegar. Matar el auth duplicado + el client-side waterfall detrás del login. Medir antes/después de cada cambio.

**Causa raíz (auditoría con evidencia, no las 95 force-dynamic):**
1. `getUser()` (red a Supabase Auth) 3-4× por navegación autenticada: `middleware.ts:34` + `Navbar.tsx:36` + `coach/page.tsx:137` (+ `api/cpi` en perfil).
2. `/coach` y `/perfil` son `'use client'` → bajan shell vacío, fetch tras hidratar = waterfall + spinner.
3. Middleware corre `getUser()` en TODA request incl. landing pública → TTFB 1.68s.
4. `/dashboard` ya es RSC + queries paralelas = modelo a copiar (solo sobra `getUser` redundante + force-dynamic).

**Ya optimizado (NO re-tocar):** posthog lazy (`PostHogProvider.tsx:21`), recharts admin lazy (`AdminChart.tsx`), perfil queries paralelas.

## Tareas (orden impacto × bajo riesgo)

### Tier 1 — riesgo bajo, no protegido (PRIMERO)
- [ ] **T1. Lazy-load recharts en `/perfil/stats`** — `perfil/stats/page.tsx:12-16` import estático ~420KB → `next/dynamic({ssr:false})` como `AdminChart.tsx`.
- [ ] **T2. `/dashboard`: quitar `getUser()` redundante** (`dashboard/page.tsx:30`, el middleware ya validó) + **sacar el `UPDATE` del GET de `/api/cpi`** (`api/cpi/route.ts:37-42`, escritura en lectura). CPI cacheado se lee, no se recalcula+escribe en cada GET.

### Tier 2 — riesgo medio, protocolo anti-caída
- [ ] **T3. Excluir rutas públicas/no-protegidas del `getUser()` del middleware** (`middleware.ts`). PROTEGIDO. Mantener refresh de cookie donde corresponde. Deploy → Juanjo confirma prod.

### Tier 3 — riesgo medio, RSC (mata el waterfall)
- [ ] **T4. `/coach` → Server Component** (`coach/page.tsx`): resolver user desde cookies (sin red), 7 queries server-side en paralelo, Suspense streaming, hijos client solo para interactividad. Sin spinner de carga inicial.
- [ ] **T5. `/perfil` → Server Component** + leer CPI cacheado de `profiles` en vez de `/api/cpi` re-auth.

### Tier 4 — Navbar (mayor riesgo histórico, ÚLTIMO)
- [ ] **T6. Auth del Navbar por contexto desde server** (`Navbar.tsx` + `layout.tsx`, PROTEGIDOS): layout resuelve `{user,isAdmin}` una vez tras middleware y baja por contexto. Elimina 2 round-trips/navegación y saca el async del Navbar (más seguro). Deploy → Juanjo confirma prod.

### Cierre
- [ ] **T7. Limpieza force-dynamic redundante** en ~90 API routes (higiene, no perf).
- [ ] **T8. Medir baseline final vs inicial** (TTFB + tiempo a contenido autenticado) y reportar.

**Regla:** medir antes y después de cada Tier. Cambios en protegidos = cambio mínimo + test + build + commit individual + confirmación de Juanjo post-deploy (incidente 25-mar).
