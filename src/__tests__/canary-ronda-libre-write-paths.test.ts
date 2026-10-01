/**
 * Canario: TODO camino que guarda puntajes o cierra una ronda libre avisa a
 * quienes la siguen (push). Review PR #449 C1: la ronda 4YDC3G era admin_mode →
 * score-grupo, que guardaba con su propia RPC y nunca llamaba al push.
 *
 * Regla: en el cliente, la RPC `upsert_ronda_libre_scores` y el RPC
 * `finalizar_ronda_libre` SÓLO se llaman desde src/lib/data/ronda-libre-scores.ts
 * (que dispara el push). Nadie escribe `estado: 'finalizada'` directo (P0 RLS
 * 29-sep: el cliente ya no tiene permiso; ver canary-ronda-libre-no-direct-writes). En el servidor,
 * cada ruta que los escribe tiene que llamar a pushRoundUpdate.
 *
 * Falla si aparece una pantalla de anotar que guarda por fuera.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'scripts') walk(p, out) }
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/')
const files = walk(SRC).map(p => ({ file: rel(p), text: readFileSync(p, 'utf8') }))

/** Únicos archivos que pueden nombrar las RPC de puntajes (individual y de equipo). */
const RPC_ALLOWED = new Set([
  'lib/data/ronda-libre-scores.ts',                 // capa de datos del cliente: dispara triggerRoundUpdatePush
  'app/api/admin/rondas-libres/[id]/scores/route.ts', // admin: llama pushRoundUpdate
])

/** Únicos archivos que pueden finalizar una ronda libre (SQL crudo incluido). */
const FINALIZE_ALLOWED = new Set([
  'app/api/admin/actions/force-close/route.ts',
  'app/api/admin/rondas-libres/[id]/route.ts',
  'app/api/admin/health-check/fix/route.ts',
  'lib/data/tournaments/lifecycle.ts',
])

// ESCRITURAS del estado (no lecturas/filtros): `.update({ estado: 'finalizada' })`
// sobre rondas_libres (supabase-js) o `UPDATE rondas_libres SET estado='finalizada'` (SQL crudo).
const FINALIZA_RE = /from\(\s*['"]rondas_libres['"]\s*\)[\s\S]{0,160}\.update\(\s*\{[^}]*estado\s*:\s*['"]finalizada|UPDATE\s+rondas_libres\s+SET\s+estado\s*=\s*['"]finalizada/i

describe('canario — caminos de escritura de ronda libre avisan a los seguidores', () => {
  it('las RPC upsert_ronda_libre_scores / upsert_ronda_equipos_scores sólo se llaman desde la capa de datos (o rutas que empujan)', () => {
    const offenders = files
      .filter(f => /rpc\(\s*['"]upsert_ronda_(libre|equipos)_scores['"]/.test(f.text) && !RPC_ALLOWED.has(f.file))
      .map(f => f.file)
    expect(offenders, 'usá saveRondaLibreScores() / saveRondaEquiposScores() de src/lib/data/ronda-libre-scores.ts').toEqual([])
  })

  it("nadie cierra una ronda libre (estado finalizada, ni en SQL crudo) por fuera de los caminos que empujan", () => {
    const offenders = files
      .filter(f => FINALIZA_RE.test(f.text))
      .filter(f => !FINALIZE_ALLOWED.has(f.file))
      .map(f => f.file)
    expect(offenders, 'usá finalizarRondaLibre() de src/lib/data/ronda-libre-scores.ts').toEqual([])
  })

  it('scramble/foursome: el snapshot del push lee ronda_equipos por la fuente única (fetchRondaEquipos), no una copia', () => {
    const snapshot = files.find(f => f.file === 'lib/push/round-snapshot.ts')?.text ?? ''
    expect(snapshot).toContain('fetchRondaEquipos(')
    expect(snapshot).not.toContain("from('ronda_equipos')")
    const copies = files.filter(f => f.text.includes("from('ronda_equipos')")).map(f => f.file)
    expect(copies).toEqual(expect.arrayContaining(['lib/data/ronda-libre.ts']))
  })

  it('la capa de datos dispara el push al guardar (individual y equipos) y al finalizar', () => {
    const text = files.find(f => f.file === 'lib/data/ronda-libre-scores.ts')?.text ?? ''
    expect(text).toContain('triggerRoundUpdatePush(input.codigo, { jugadorId: input.jugadorId })')
    // Equipos y finalización también llevan jugadorId: un invitado sin cuenta que
    // termina la ronda tiene que poder mandar el "Resultado final" (review C-1).
    expect(text.split('triggerRoundUpdatePush(input.codigo, { jugadorId: input.jugadorId })').length - 1).toBe(2)
    expect(text).toContain("rpc('finalizar_ronda_libre'")
    expect(text).toContain("if (finalizada || (error && !rechazado)) triggerRoundUpdatePush(codigo, { force: true, jugadorId: opts.jugadorId })")
    // El RPC de cierre sólo se llama desde la capa de datos (que empuja).
    const rpcFinalize = files.filter(f => /rpc\(\s*['"]finalizar_ronda_libre['"]/.test(f.text)).map(f => f.file)
    expect(rpcFinalize).toEqual(['lib/data/ronda-libre-scores.ts'])
    const finalize = files.find(f => f.file === 'app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda.ts')?.text ?? ''
    expect(finalize).toMatch(/finalizarRondaLibre\([^)]*jugadorId: activeJugadorId/)
  })

  it('cada ruta del servidor que escribe llama a pushRoundUpdate', () => {
    for (const file of [...RPC_ALLOWED, ...FINALIZE_ALLOWED].filter(f => f !== 'lib/data/ronda-libre-scores.ts')) {
      const text = files.find(f => f.file === file)?.text
      expect(text, `${file} existe`).toBeDefined()
      expect(text, `${file} llama pushRoundUpdate`).toContain('pushRoundUpdate(')
    }
  })

  it('los scorers (individual, grupo/admin, finalizar) usan la capa de datos', () => {
    // Post-refactor (oct-2026): las páginas son orquestadores; quien guarda
    // son los hooks. Si aparece un hook nuevo que escribe, entra acá.
    for (const file of [
      'app/ronda-libre/[codigo]/score/hooks/useScoreSave.ts',
      'app/ronda-libre/[codigo]/score/hooks/useOfflineResync.ts',
      'app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave.ts',
      'app/ronda-libre/[codigo]/score-grupo/hooks/useTeamScoreSave.ts',
      'app/ronda-libre/[codigo]/score-grupo/hooks/useFinalizeGrupo.ts',
      'app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda.ts',
    ]) {
      const text = files.find(f => f.file === file)?.text ?? ''
      expect(text, file).toMatch(/saveRondaLibreScores\(|saveRondaEquiposScores\(|finalizarRondaLibre\(/)
    }
  })
})
