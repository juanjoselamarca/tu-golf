# Plan de arreglos — QA Crawler de botones (2026-06-16)

## Origen
Barrido del crawler `scripts/qa-crawler.mjs` contra prod (autenticado, readonly,
27 rutas, 12-jun 23:51 → 16-jun 00:51). Resultado: **P1=1, P2=0, P3=0**.

El único P1 destapó un **patrón sistémico**, no un caso aislado: `navigator.clipboard.writeText`
se usa en ~20 lugares y varios no manejan el rechazo de la promesa ni ofrecen
fallback. Cuando el navegador del usuario niega el portapapeles (contexto no-seguro,
permiso denegado, navegador viejo, iOS in-app webview), el botón:
1. Lanza una excepción no capturada (los que usan `.then()` sin `.catch()`), y
2. No le da ningún feedback al usuario (no copia y no avisa).

## Diagnóstico — clasificación de los 20 call sites

**A. Rotos (uncaught — `.then()` sin `.catch()`):** ← bugs P1/latentes
- `src/app/ronda-libre/[codigo]/page.tsx:404` ← la P1 detectada
- `src/components/LeaderboardTable.tsx:364`
- `src/app/organizador/[slug]/salida/page.tsx:95`
- `src/app/organizador/[slug]/jugadores/components/TournamentInvitationCard.tsx:37,78`

**B. Frágiles (try/catch que traga el error → sin feedback, sin fallback):**
- `src/app/tarjeta/[id]/page.tsx:114`
- `src/app/perfil/historial/[id]/page.tsx:114`
- `src/app/ronda-libre/[codigo]/score/components/FinishedRoundView.tsx:79`
- `src/components/ui/ShareSheet.tsx:51`
- `src/app/organizador/nuevo/sections/InscripcionSection.tsx:30`
- `src/app/organizador/[slug]/jugadores/components/TournamentActionsBar.tsx:34`
- `src/components/InvitarAmigos.tsx:25` (branch `else` posiblemente fuera del try)
- `src/components/ShareRoundButton.tsx:26`
- `src/components/ShareResultsButton.tsx:54`
- `src/app/ronda-libre/nueva/page.tsx:454` (`try { await } catch {}` — traga silencioso)

**C. Ya correctos (referencia del patrón bueno):**
- `src/components/CopyLinkButton.tsx` — clipboard API + fallback `execCommand`
- `src/components/ui/RoundCode.tsx` — guarda `!navigator.clipboard`

## Fix — solución permanente

### 1. Helper compartido `src/lib/clipboard.ts`
`copyToClipboard(text: string): Promise<boolean>` — nunca lanza:
1. Intenta `navigator.clipboard.writeText` en try/catch (API moderna, contexto seguro).
2. Fallback legacy: `<textarea>` temporal + `document.execCommand('copy')`.
3. Devuelve `true`/`false`. SSR-safe (`typeof document === 'undefined'` → false).

Va en `src/lib/` porque es infraestructura, no dominio golf.

### 2. Migrar los 18 call sites (A + B) al helper
Patrón de reemplazo:
```ts
// antes (roto)
const handleCopy = () => {
  navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(...) })
}
// después
const handleCopy = async () => {
  if (await copyToClipboard(url)) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
}
```
Preservando en cada sitio su lógica circundante (trackEvent, fallback `window.open`,
`navigator.share`). Beneficio: una sola ruta de código endurecida = un solo lugar
que mantener (CERO FALLOS: una falla, un fix global).

### 3. Test unitario
`src/lib/__tests__/clipboard.test.ts` — mock de `navigator.clipboard` OK / reject /
ausente; verificar boolean y que nunca lanza.

## "El que toca, ordena" — decisión documentada
`ronda-libre/[codigo]/page.tsx` (2038 LOC) y `ronda-libre/nueva/page.tsx` (2118 LOC)
están en la lista de monstruos. La edición es un **swap localizado de 1 llamada**
(excepción de cambio trivial). Refactorizar 2 archivos de 2000+ LOC como prerequisito
de un hardening de clipboard es desproporcionado y AUMENTA el riesgo (refactor de
monstruo bajo una tarea chica). Se mantienen sus refactors como deuda ya trackeada en
`docs/REORDENAMIENTO_TRACKING.md`; aquí solo el swap.

## Problemas registrados (NO en este PR — follow-ups)
1. **Leg 2 — testing de mutación.** 9 botones destructivos saltados en readonly
   (`Crear cuenta`, `Eliminar mi cuenta`, `Crear ronda`, `Registrar ronda`,
   `Enviar enlace de recuperación`). Probar acotado a la cuenta E2E vía `/qa` sobre
   los 6 flujos críticos, con aserciones — no clicks a ciegas. `Eliminar mi cuenta`:
   NUNCA contra cuenta real; si se prueba, recrear la cuenta E2E después.
2. **Cap de elementos.** 4 rutas superaron el cap de 40 (`leaderboard` dejó 4 sin
   probar; dashboard/login/register 1 c/u). Re-correr esas rutas con `--maxel=80`.
3. **Cobertura admin.** El barrido corrió con `admin=false`. Falta una pasada
   `--admin` sobre las 8 rutas `/admin/*`.
4. **Wiring del crawler a CI.** Encolar `qa-crawler.mjs --mode=readonly` como job
   periódico (semanal) o dentro de `/pre-torneo`, para que la regresión de botones
   se detecte sola.

## Validación
- `npx tsc --noEmit` (0 errores)
- `npm run test` (incluye el test nuevo del helper + canarios)
- `npm run build`
- `superpowers:code-reviewer` (diff > 100 LOC)
- Re-correr `qa-crawler.mjs` contra el preview del PR → la P1 de clipboard desaparece.
