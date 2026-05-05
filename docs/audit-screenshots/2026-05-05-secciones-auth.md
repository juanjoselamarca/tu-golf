# Auditoría visual — secciones autenticadas — 2026-05-05

**Método:** análisis estático (Grep) sobre los .tsx de cada sección. El audit
de Playwright contra producción no llega a estas pantallas porque están detrás
de auth (redirige a `/login`). Las screenshots se generarán post-deploy con
una versión de `audit-visual-theme.mjs` que haga login con un usuario de prueba.

## 1. `/coach` (tAIger+) — `src/app/coach/page.tsx`

### Hallazgos light mode
| Línea | Patrón | Antes | Después |
|---|---|---|---|
| 63-64 | Loading text gold sobre `--bg` | `#c4992a` (2.53:1) | `#8A6A16 + fontWeight 600` (5:1) |
| 86 | Stat values 22px `#c4992a` sobre `--bg-surface` | 2.65:1 | `#8A6A16` (5:1) |
| 88 | Stat label `rgba(255,255,255,0.35)` sobre `--bg-surface` (white) | invisible | `var(--text-3)` (4.83:1) |
| 113 | "Importar historial" link `#c4992a` | 2.65:1 | `#8A6A16` (5:1) |
| 139 | "Sesiones anteriores" h2 `rgba(255,255,255,0.35)` | invisible | `var(--text-3)` |
| 159 | Fecha `rgba(255,255,255,0.25)` | invisible | `var(--text-3)` |

**Status:** ✅ todos los fixes aplicados.

## 2. `/coach/sesion/[id]` — `src/app/coach/sesion/[id]/page.tsx` + `error.tsx`

### Hallazgos
| Línea | Patrón | Después |
|---|---|---|
| 263 | Botón "Volver al coach" `#c4992a` | `#8A6A16` |
| 304 | Badge sesión `#c4992a` sobre tinte gold (light) | `#8A6A16` |
| 369 | "tAIger+ está analizando..." `#c4992a` | `#8A6A16` |
| 403 | "Gracias por tu feedback" `#c4992a` | `#8A6A16` + bold |
| error.tsx 11 | "Inicio" link `#c4992a` | `#8A6A16` |

**Status:** ✅ aplicado.

## 3. Widget PGA — `src/components/PGALiveWidget.tsx`

**Bug arquitectural detectado:** el widget usaba `background: var(--bg-surface)`
(`#fff` en light mode) pero todos los textos internos son `rgba(255,255,255,X)`
(blanco semi-transparente). En light mode = blanco-sobre-blanco, completamente
invisible. El widget solo se renderiza dentro de `HeroSection`, que ahora tiene
un fondo dark forzado (`#070d18`).

**Fix:** hardcodear el bg del widget a `#0e1c2f` (dark navy del sistema). El
widget queda dark-themed independiente del modo global, coherente con la
intención original de ser "PGA TV broadcast style". Coherente con que vive
dentro del hero dark.

**Status:** ✅ aplicado.

## 4. `/en-vivo` — `src/app/en-vivo/page.tsx`

### Hallazgos
| Línea | Patrón | Después |
|---|---|---|
| 132, 171, 190, 241, 268, 341, 352, 401 | `color: 'var(--ivory)'` (#f3efe6) sobre `var(--bg)` light = ratio 1.15 | `var(--text)` (16:1) |
| 277, 293 | Badges con `color: '#c4992a'` (10px text en pill gold-tint) | `color: '#8A6A16'` |

**Nota:** `var(--ivory)` es el legacy token dark-only `#f3efe6`. Usarlo como
`color:` rompe accesibilidad en light mode. La regla canónica: para texto
usar `var(--text)` / `var(--text-2)` / `var(--text-3)`; `var(--ivory)` solo
tiene sentido sobre fondos siempre-dark (cards `bg-bg-card`).

**Status:** ✅ aplicado.

## Pendientes / decisiones para Juanjo

1. **No existe `/intelligence`** como ruta. La memoria de Claude sugería
   "intelligence/análisis" pero el repo solo tiene `/coach`, `/perfil/stats`,
   y `/indices` (público). Si hay otra sección en mente, indicar la ruta
   exacta y se audita.
2. **Audit con login** queda pendiente como mejora del script: agregar paso
   Playwright que se loguee con `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` y
   navegue las 4 secciones (con cookies persistidas). Por ahora el audit
   matemático (`audit-contrast.mjs`) cubre tokens canónicos.
3. **Otros archivos con `#9ca3af` text** (NotificationHub, MatchStatusBar,
   TeamLeaderboard, GWILeaderboard, etc.) no se tocaron porque viven en
   pantallas auth aún no auditadas — pueden estar OK sobre fondos card
   específicos. Revisar caso a caso cuando se haga audit visual con login.
