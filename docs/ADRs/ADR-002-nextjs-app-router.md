# ADR-002 — Next.js 16 App Router

**Estado**: Aceptado (decidido con Next 14; actualizado a Next 16 el 2026-09-14)
**Fecha**: 2026-03-17

## Contexto

Framework para el frontend + API routes + SSR. Alternativas:

- **Remix**: excelente DX pero ecosistema menor
- **SvelteKit**: muy rápido, pero equipo más pequeño, cambio de paradigma
- **Vanilla React + Express**: máxima flexibilidad pero cero batteries included
- **Next.js Pages Router (v13)**: maduro pero legacy
- **Next.js App Router (v14)**: nuevo paradigma (Server Components), mejor para SSR

## Decisión

**Next.js con App Router** (14 al decidir, 16 desde 2026-09-14).

Razones:
1. **Server Components reducen JS al cliente** — crítico para usuarios móviles en la cancha con conexión golf-course-rural
2. **API routes integradas** — sin necesidad de servidor separado
3. **Deploy nativo en Vercel** — zero config
4. **Ecosistema React** — bolsa de librerías enorme
5. **TypeScript de primera** — tipos en route handlers, layouts, params

## Consecuencias

### Positivas
- Menos JS al cliente en páginas predominantemente servidor (landing, scorecards públicos)
- Streaming de HTML para páginas con data loading progresivo
- Convenciones fuertes (`page.tsx`, `layout.tsx`, `error.tsx`) reducen decisiones
- Middleware único en `src/middleware.ts` para auth

### Negativas
- **`force-dynamic` obligatorio** en TODA API route que toca Supabase. Sin esto, Next intenta renderizarlas estáticas y falla en producción silenciosamente. Regla documentada en CLAUDE.md y en pre-push check.
- **Server/Client boundary explícito** con `'use client'` — requiere disciplina
- **Curva de aprendizaje** para Server Components — el modelo mental difiere de Pages Router
- **Versiones tienen CVEs frecuentes** — mantenerse actualizado es trabajo recurrente

## Historial de versiones

- **14 → 15** (`9cc279ec`, 2026-09): cierra las 5 HIGH de P0-2. `params` y `searchParams` pasan a Promise, React 19, Node 24.
- **15 → 16** (`7f4869bc`, 2026-09): Turbopack por defecto en build, `next lint` reemplazado por la CLI de eslint, `npm audit` en 0. Pendiente migrar `src/middleware.ts` a la convención `proxy` (deprecada, no rota).

## Cuándo reconsiderar

- Si Server Components + RSC introduce bugs recurrentes de hidratación
- Si Vercel cambia su modelo de pricing drásticamente
- Si otro framework alcanza paridad + ventajas claras (React Server Components nativos en Remix, etc.)

Por ahora: **mantener Next.js**. Planificar upgrade a cada versión mayor con QA.
