# Auditoría — Sistema de "Compartir" unificado (Fase 1)

Fecha: 2026-06-17 · Branch: `feat/compartir-unificado-claude` · Autor: Claude (CTO)

## Veredicto

La inconsistencia es **estructural, no cosmética**. Hay **~6 implementaciones
independientes** del mismo concepto (armar payload + `navigator.share` + fallback),
cada una con su propio copy, sus propios estilos hardcodeados, su propio fallback y
su propio criterio de capability-detection. Por eso "no parece la misma app" y por eso
acumula bugs: no hay una fuente única que arreglar.

Escala actual del sistema: **3/10** (funciona a veces, se ve distinto en cada lugar,
copy con errores, un sheet roto en dark mode, un número público incorrecto).

## Inventario de superficies

| # | Superficie | Archivo | Comparte | navigator.share | canShare | Fallback | Estilos | Tokens |
|---|---|---|---|---|---|---|---|---|
| 1 | Motor tarjetas | `src/lib/share-card.ts` (654 LOC) | imagen PNG + texto | sí | **sí** ✓ | download | canvas hardcoded | n/a |
| 2 | Sheet genérico | `src/components/ui/ShareSheet.tsx` | link + texto | sí | no | WhatsApp link visible | tokens ✓ | sí ✓ |
| 3 | Botón ronda | `src/components/ShareRoundButton.tsx` | texto + url | sí | no | clipboard + `alert()` | inline `#c4992a` | no |
| 4 | Botón resultados | `src/components/ShareResultsButton.tsx` | texto | sí | no | wa.me → clipboard | inline `rgba(196,153,42,.12)` r8 | no |
| 5 | Sheet ronda | `src/components/ronda/ShareMenu.tsx` | url (live/score) | sí | no | wa.me | inline `#ffffff` | **no — roto dark** |
| 6 | Copiar link org | `src/components/CopyLinkButton.tsx` | url login-redirect | no | no | — (solo copia) | inline r10 | parcial |
| 7 | Invitar amigos | `src/components/InvitarAmigos.tsx` | url referral | sí | no | clipboard | inline r10 | parcial |
| 8 | QR torneo | `src/components/QRModal.tsx` | QR de url | no | no | — | inline | parcial |
| 9 | OG ronda | `src/app/ronda-libre/[codigo]/layout.tsx` | link preview | n/a | n/a | n/a | n/a | calcVsPar **correcto** ✓ |
| 10 | OG tarjeta | `src/app/tarjeta/[id]/layout.tsx` | link preview | n/a | n/a | n/a | n/a | par fijo **INCORRECTO** ✗ |

Consumidores: `torneo/[slug]` (4), `TournamentCardMenu` (6,8), `ronda-libre/[codigo]`
(1 vía `compartirLeaderboard`), `score/page.tsx` + `FinishedRoundView` (1,5),
`ronda-libre/nueva` (TODO sin migrar a ShareSheet, línea 426).

## Bugs confirmados (file:line)

**Correctitud (P0 — número público equivocado):**
- `tarjeta/[id]/layout.tsx:25` — vs-par del OG contra par fijo 36/72, no el par real
  de la cancha. El link compartido muestra un score vs-par incorrecto. (El path de
  `ronda-libre/[codigo]/layout.tsx:36` sí lo hace bien con `parMap`.)

**Dark mode:**
- `ShareMenu.tsx:25,29,35` — `background:'#ffffff'`, `color:'#1a1a2e'` hardcodeados →
  sheet blanco con texto oscuro en modo dark. Viola el sistema tri-state de color.

**Fuente única de URL violada:**
- `ShareMenu.tsx:10`, `share-card.ts:525`, `InvitarAmigos.tsx:10` hardcodean
  `'https://golfersplus.vercel.app'`; `CopyLinkButton.tsx:7` re-lee el env.
  Existe `@/lib/site-url` (`SITE_URL`) y NO se usa. En preview deploys el link apunta
  a prod. Single-source-of-truth roto.

**Copy (app premium, auditoría de texto):**
- `share-card.ts:518-519` — `"gano"` (sin tilde, debe ser "ganó"), `"quedo #"` ("quedó").
- Tagline inconsistente en la tarjeta: "EL GOLF AMATEUR EN ESPAÑOL" (header) vs
  "Primera plataforma de golf en español" (CTA), `share-card.ts:194,344`.

**Feedback al usuario (5 comportamientos distintos para lo mismo):**
- `ShareRoundButton.tsx:28` — `alert()` nativo, no premium.
- `ShareSheet.tsx:50-57` — copia sin toast de confirmación (cierra en silencio); falla
  en silencio.
- `ShareMenu.tsx:16` — si `navigator.share` lanza (no-Abort), cierra sin avisar.
- Fallbacks divergentes: clipboard+alert / wa.me→clipboard / wa.me / solo-copia / clipboard.

**Capability detection inconsistente:**
- Solo `share-card.ts:521` usa `navigator.canShare({files})` (el patrón correcto).
  Las otras 5 chequean solo `navigator.share` truthy.

**Visual (la causa de "no parece la misma app"):**
- Radios mezclados (8/10/12/14px), alphas de fondo dorado distintos (.08/.12/.14),
  paddings ad-hoc, ningún `<Button>` compartido, z-index sin sistema
  (ShareSheet z-200, ShareMenu z-100, QRModal z-1000).
- Emoji 🏆🥈🥉🤝🥇 en tarjeta canvas y en texto de resultados → renderizado por OS,
  no marca. Tensión con la regla "no emoji infantil" (a revisar en diseño).

## Arquitectura objetivo (decidida)

1. **Una fuente del payload** — `src/golf/share/` con builders PUROS y testeables (TDD):
   `buildRoundShare`, `buildTournamentShare`, `buildInviteShare`, `buildLiveShare` →
   `{ title, text, url, image? }`. Toda la lógica de copy/scoreDiff/medallas/URL vive
   acá una sola vez. URL siempre vía `SITE_URL`. Datos vía `src/lib/data/`.
2. **Un primitivo de UI** — `useShare()` (hook) + `<ShareButton>` / `<ShareSheet>`
   que encapsulan `canShare({files}) → share → fallback` con estados
   (idle/loading/copiado/error), toast unificado, SOLO tokens. Las 6 implementaciones
   se borran.
3. **El motor de imagen** (`share-card.ts`, 654 LOC) está en la lista de "sucios" →
   "el que toca, ordena": refactor a `src/golf/share/card/` (canvas en módulos chicos,
   sin hardcodes globales, <300 LOC por archivo) antes de integrarlo.
4. **OG metadata** — un helper único de vs-par real reutilizado por ambos layouts.

NO se construye framework de config. Un builder + un primitivo + adapters.

## Nota de método

El baseline visual con Playwright se captura **por superficie en el momento de
migrar cada una** (before/after), no en un barrido masivo upfront: es lo que
`design-review` necesita igual, es más rápido, y la auditoría estática ya identificó
cada bug concreto. Decisión de CTO para no quemar tiempo en screenshots de 10
pantallas antes de tener el diseño nuevo.

## Próximo paso

Fase 2: `design-shotgun` (sheet + tarjeta ronda + tarjeta torneo + QR/invitar) →
elegir dirección → `writing-plans` + `plan-eng-review` para lockear arquitectura →
implementación incremental (primitivo → 1 superficie validada → fan-out).
