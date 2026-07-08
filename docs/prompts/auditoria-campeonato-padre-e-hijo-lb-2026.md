# Prompt — Auditoría E2E campeonato "Padre e Hijo LB 2026"

> Prompt autónomo para pegar en una sesión nueva de Claude Code. Despacha agentes que
> auditan y dejan al 100% el flujo completo de un campeonato scramble-parejas / neto / 9
> hoyos, desde la inscripción hasta el cierre. Endurecido con red-team (2026-07-07):
> premisa P0 corregida (el fix de stroke_index ya está en main vía PR #244), sitios reales
> del board de equipos enumerados, anclado a símbolos, guardas de prod y edge cases +
> criterios de aceptación agregados.

---

ROL: CTO de Golfers+ bajo directiva CERO FALLOS. Auditás end-to-end y dejás al 100% el
flujo COMPLETO del campeonato "Padre e Hijo LB 2026", DESDE el formulario de INSCRIPCIÓN
HASTA el CIERRE/finalización del torneo. Leé CLAUDE.md primero (protocolo de inicio,
archivos protegidos, commits puros, code-reviewer >100 LOC, "el que toca ordena", "un
concepto una fuente"). Es un CASO DE PRUEBA (no un torneo en vivo): el objetivo es que
cuando este torneo se cree de verdad más adelante, sea perfecto.

SKILLS A USAR: superpowers:using-git-worktrees (aislamiento), superpowers:systematic-debugging
(causa raíz de cada hallazgo), superpowers:test-driven-development (test que falla antes del
fix), superpowers:code-reviewer (PRs >100 LOC), /pre-push antes de pushear.

CASO EXACTO: 24 jugadores → 12 parejas · SCRAMBLE · NETO · 9 hoyos · cancha "Norte".
CICLO A AUDITAR: inscripción (self-service en src/app/torneo/[slug]/unirse + api
torneos/[slug]/inscribirse, y alta por organizador InscribirPlayerForm) → gestión de
jugadores/parejas → tees → arranque → scoring en vivo → neto 9h → board → resultados →
CIERRE (useTournamentLifecycle: draft→open→start→close, congelado, ganadores, estado).

SEGURIDAD DE PROD (crítico): el torneo real "Padre e Hijo 2026" YA existe en prod en
estado draft. NO usar ese slug/nombre. Creá el caso de prueba con slug único
qa-padre-hijo-<timestamp>. Antes de cualquier DELETE de limpieza: verificá
import_jobs/timestamps/roster y confirmá que el tournament_id es el de prueba, nunca el
real. LIMPIEZA obligatoria al final.

CANCHA "Norte": verificá EN PROD (no en el repo — migración ≠ prod) vía
run-sql.mjs el course_id exacto del child 9h Norte (loop_nombre='Norte', parent=Brisas de
Santo Domingo), distinto de los combos 18h "Norte + Sur"/"Norte + Este". SI reales =
15,13,3,11,9,1,17,7,5 (impares, escala 18h, NO permutación 1-9 → la normalización es
genuinamente necesaria). ADVERTENCIA CONFIRMADA: los course_tees son combos 18h en el
PARENT; el child 9h tiene CR36/slope120 placeholder y puede NO tener tee 9h propio.
Decidí y documentá de dónde sale el CR/slope 9h por género ANTES de tocar el motor — no
inventes ni uses el placeholder.

HALLAZGOS A VERIFICAR + ARREGLAR (localizá por SÍMBOLO, no por línea — pueden estar stale):
 P0 — stroke_index 9h sin normalizar en el path de EQUIPOS.
   normalizeStrokeIndexMap + isValidStrokeIndexPermutation YA están en main
   (src/golf/core/stroke-index.ts, PR #244) y aplicados SOLO al path individual de
   ronda-libre (src/lib/data/ronda-libre.ts, src/lib/ronda/leaderboard.ts). NO recrear ni
   mergear fix/fix-stroke-index-net-claude (rama divergente/superada). El trabajo es
   CABLEAR la función canónica en los paths de EQUIPO que hoy usan SI crudo, normalizando
   el siMap UNA vez antes de asignar golpes en:
     (a) Motor del board de torneo: src/golf/leaderboard/team-standings.ts
         (computeScrambleStandings/Foursome/BestBall) — o normalizar el array holes en los
         call-sites torneo/[slug]/en-vivo/page.tsx y torneo/[slug]/page.tsx.
     (b) Fetch de hoyos: src/lib/data/tournaments/leaderboard.ts (fetchCourseHoles +
         buildFallbackCourseHoles).
     (c) Share ronda-libre: src/lib/ronda/team-ranking.ts.
     (d) Scorer en vivo: score-grupo/page.tsx.
   Grep obligatorio antes de cerrar: strokesRecibidosEnHoyo y stroke_index en src/ —
   todo call-site recibe SI normalizado.
 P1 — scorer en vivo muestra vs-par GROSS para equipos, no NETO (símbolo teamVsPar en
   score-grupo/page.tsx). Unificá con el board (un solo vs-par neto).
 P1 — share diverge del board: rankTeams recalcula team handicap e ignora handicap_equipo
   almacenado (team-ranking.ts). Usar el almacenado.
 P2 — handicap_pct del wizard no llega al motor (calcularHandicapScramble USGA-fijo).
 P2 — naming/matcher: seleccionar "Norte" resuelve al child 9h, no a un combo 18h.

MÉTODO:
FASE 0 — Protocolo de inicio + UN worktree dedicado. NO paralelizar los fixes de SI (todos
  convergen en el mismo concepto y archivos solapados → colisiones). Secuencial. Paralelizar
  solo trabajo ortogonal (auditoría de inscripción/cierre vs fix de SI).
FASE 1 — Reproducir con un test que falla antes de tocar. El test que HOY NO EXISTE:
  computeScrambleStandings(teams, holes, parTotal, 'scramble', 'neto') con los holes reales
  de Norte y assert Σ strokesRecibidos == courseHandicap9h por equipo. Un test de ronda-libre
  individual NO cuenta como cobertura del P0 de equipos.
FASE 2 — Ejecución E2E REAL contra preview/prod con slug qa-padre-hijo-<timestamp>, ciclo
  completo (inscripción → parejas → tees → scoring → board → resultados → cierre). Verificá a
  mano que board neto, scorer, resultados y share coincidan hoyo por hoyo. Playwright 390px +
  creds E2E. EDGE CASES OBLIGATORIOS: inscripción #25 (cap 24), doble inscripción del mismo
  user, 23 jugadores (pareja impar / scramble con 1 handicap → sorted[1] undefined), empate
  de neto entre 2 parejas + desempate, edición de score DESPUÉS de cerrar (debe estar
  bloqueada; si no, es P0 de congelado), RLS (no-organizador no puede cerrar ni ver board en
  draft). Limpieza verificada al final.
FASE 3 — Detectar + ARREGLAR con higiene: cada fix causa raíz + TDD + commit puro. Archivo
  sucio → refactor al estándar primero. code-reviewer en PRs >100 LOC. pre-push completo.
  Confirmá deploy Vercel post-merge.

ENTREGABLE: docs/auditoria-campeonato-padre-e-hijo-lb-2026.md (tabla por etapa del ciclo +
faltantes rankeados P0-P3 = objetivos), PRs revisados con el canario de equipos verde, y
veredicto go/no-go + escala 1-10 antes/después.

DEFINICIÓN DE TERMINADO (no declarar "listo" sin TODOS estos checks):
 [ ] Test de equipos scramble·neto·9h con SI reales de Norte VERDE, invariante
     Σ strokesRecibidos == courseHandicap9h validado en board, scorer y share.
 [ ] Grep de strokesRecibidosEnHoyo / stroke_index en src/ = 0 call-sites con SI crudo en
     paths de equipo.
 [ ] Los 5 edge cases de FASE 2 probados con resultado documentado (cap 24, doble
     inscripción, pareja impar, empate+desempate, congelado post-cierre, RLS).
 [ ] E2E completo inscripción→cierre corrido con slug qa-*, limpieza confirmada, torneo real
     "Padre e Hijo 2026" intacto.
 [ ] tsc 0 errores + build + test + health-check sin FAIL. Deploy Vercel confirmado success.
 [ ] docs/auditoria-*.md con veredicto go/no-go y escala 1-10 antes/después.

Autonomía CTO: lo técnico lo resolvés solo; solo frenás ante decisión de producto real.
