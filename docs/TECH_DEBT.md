# Catálogo de deuda técnica — Golfers+

**Última actualización**: 2026-04-23
**Fuente**: `docs/audits/2026-04-23-revision-completa.md`

> **Cómo usar este doc**: cada vez que un item se resuelve, marcarlo ✅ con link al commit. Cada vez que se descubre nueva deuda, agregarla al final con P0/P1/P2.

## P0 — Bloquea (resolver ya)

| # | Item | Estado | Notas |
|---|------|--------|-------|
| P0-1 | protobufjs CRITICAL + 6 transitivos | ✅ Resuelto `bdf0f7b` (2026-04-23) | `npm audit fix` no-breaking |
| P0-2 | Next.js 14 con 5 HIGH (incl. DoS) | ⏳ En plan | Requiere branch `upgrade/next-15` + QA extenso. Ver `docs/ADRs/ADR-002` y plan separado |
| P0-3 | Cero CI en GitHub Actions | ✅ Resuelto `ea3695e` + fixes `0204a2f`,`ca1f6f3`,`49c8f80` (2026-04-23) | `.github/workflows/ci.yml` con tsc+tests+build+audit. Fix VAPID lazy init + pool vitest condicional (forks en CI, vmThreads local) |
| P0-4 | Sin baseline performance/bundle | ⏳ Pendiente | Requiere dev server up + Lighthouse. Incluir en próximo sprint |

## P1 — Urgente (próximas 2 semanas)

| # | Item | Estado | Notas |
|---|------|--------|-------|
| P1-1 | `ronda-libre/nueva/page.tsx` God Object (2118 LOC) | ⏳ Plan | Sprint dedicado. Ver plan en `docs/superpowers/plans/2026-04-20-rondas-refactor-sprint-1.md` |
| P1-2 | `ronda-libre/[codigo]/page.tsx` + `score/page.tsx` God Objects | ⏳ Plan | Mismo sprint que P1-1 |
| P1-3 | Cobertura tests no medida | ✅ Resuelto `f78dc1a` + `86786fb` (2026-04-23) | Baseline real: 27.62% (no 76.88% — error de medición inicial). Thresholds 25/20/23/25 |
| P1-3b | `course-handicap.ts` cobertura 9.52% (lógica core) | ✅ Resuelto `b5123fc` (2026-04-23) | 12 tests nuevos con vi.mock Supabase — ahora 100% statements |
| P1-4 | Upgrade Next 14 → 15 | ⏳ Plan | Ver P0-2 |
| P1-5 | No hay RUNBOOKS/ | ✅ Resuelto `1033a16` (2026-04-23) | 6 runbooks creados |
| P1-6 | No hay ADRs/ | ✅ Resuelto `a96efaa` (2026-04-23) | 10 ADRs creados |
| P1-7 | No hay diagrama sistema | ✅ Resuelto (2026-04-23) | `docs/DIAGRAMA_SISTEMA.md` |
| P1-8 | No hay catálogo deuda | ✅ Resuelto (este archivo) | |
| P1-9 | 268 console.* sin logger estructurado | ⏳ Pendiente | Crear `src/lib/logger.ts` + migración gradual |
| P1-10 | 4 clientes Supabase dispersos | ⏳ Pendiente | Migrar imports al barrel `@/lib/supabase`, borrar archivos originales |
| P1-11 | `/leaderboard` hydration mismatch SSR↔CSR | ⏳ Pendiente | Descubierto por e2e smoke 2026-04-23. React errors #418/#423/#425 en cada carga. Causa probable: `useDemoSimulation` hook inicializa estado con valor distinto en server vs client. Fix: mover initialización a useEffect con flag `mounted`. Test en `e2e/smoke-public-pages.spec.ts` tolera estos 3 IDs hasta que se arregle |

## P2 — Importante (próximo mes)

| # | Item | Estado | Notas |
|---|------|--------|-------|
| P2-1 | 9 HIGH vulnerabilities restantes | ⏳ Pendiente | Todos fix no-breaking pero bloqueados por migración Next |
| P2-2 | 5 MODERATE vulnerabilities | ⏳ Pendiente | Incluye Anthropic SDK sandbox escape |
| P2-3 | ESLint config mínimo | ⏳ Pendiente | Agregar `no-console`, custom "no-emojis-in-ui", `react-hooks/exhaustive-deps` |
| P2-4 | Build no se valida en CI standalone | ✅ Resuelto `ea3695e` | Incluido en `ci.yml` |
| P2-5 | Sin dashboard métricas negocio | ⏳ Pendiente | Crear en PostHog o docs |
| P2-6 | Sin visual regression testing | ⏳ Pendiente | Evaluar Chromatic/Percy/Playwright screenshots |
| P2-7 | `src/lib/` mezcla dominios | ⏳ Pendiente | Consolidar lógica golf a `src/golf/` — 1 sprint |
| P2-8 | `src/golf/core/colors.ts` importa React type | ⏳ Pendiente | Reemplazar `CSSProperties` por tipo propio (5 min) |
| P2-9 | Cobertura real no medida | ⏳ Ver P1-3 | |
| P2-10 | Docs viejos sin archivar en raíz | ⏳ Pendiente | Mover a `docs/archive/2026-Q2/` |
| P2-11 | `npm run lint` no se corre en pre-push | ⏳ Pendiente | Agregar al hook con modo warning |
| P2-12 | `scripts/` sin README | ⏳ Pendiente | Documentar utilidades |

## P3 — Nice-to-have

| # | Item | Notas |
|---|------|-------|
| P3-1 | Modo degradado cuando Supabase cae (banner global) | Ver `docs/RUNBOOKS/incident-supabase-down.md` |
| P3-2 | Alertas automáticas de health-check fails | Hoy requiere revisión manual `/admin/sistema` |
| P3-3 | Rate limiting por usuario en tAIger+ | Un usuario malicioso puede consumir budget |
| P3-4 | Sync offline de scores más robusta | localStorage se puede perder si usuario limpia datos |
| P3-5 | Branch protection en GitHub `main` | Opcional — hoy confiamos en pre-push + CI |
| P3-6 | Commit linter (commitlint) | Enforce conventional commits |
| P3-7 | Staging persistente separado | Hoy usamos Vercel previews por PR |

## Cómo priorizar cuando no hay consenso

Orden de prioridad de criterios (más importante primero):

1. **Viola directiva CERO FALLOS** (`docs/ADRs/ADR-009`) → P0 automático
2. **Afecta flujo crítico torneo** (wizard ronda, scorear, leaderboard) → P0/P1
3. **Vulnerabilidad de seguridad** con exploit público → P0/P1
4. **Bloquea onboarding de CTO humano** → P1
5. **Multiplica costo de mantenimiento futuro** (God Objects, duplicación) → P1/P2
6. **Mejora DX sin impacto usuario directo** → P2/P3

## Cuando cerrar un item

- Marcar ✅ con commit hash
- Si requirió enfoque distinto al original → nota breve
- Si generó deuda nueva → agregarla al catálogo

## Cómo agregar deuda nueva

```markdown
| P?-N | Descripción corta | ⏳ Pendiente | Detalles (archivo, síntoma, solución propuesta) |
```

Ubicación: al final de la sección P0/P1/P2/P3 correspondiente.
