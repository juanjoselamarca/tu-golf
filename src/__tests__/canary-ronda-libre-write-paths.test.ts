/**
 * Canario: TODO camino que guarda puntajes o cierra una ronda libre avisa a
 * quienes la siguen (push). Review PR #449 C1: la ronda 4YDC3G era admin_mode →
 * score-grupo, que guardaba con su propia RPC y nunca llamaba al push.
 *
 * Regla: en el cliente, la RPC `upsert_ronda_libre_scores` y el
 * `estado: 'finalizada'` de rondas_libres SÓLO se escriben desde
 * src/lib/data/ronda-libre-scores.ts (que dispara el push). En el servidor,
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

/** Únicos archivos que pueden nombrar la RPC de puntajes. */
const RPC_ALLOWED = new Set([
  'lib/data/ronda-libre-scores.ts',                 // capa de datos del cliente: dispara triggerRoundUpdatePush
  'app/api/admin/rondas-libres/[id]/scores/route.ts', // admin: llama pushRoundUpdate
])

/** Únicos archivos que pueden finalizar una ronda libre. */
const FINALIZE_ALLOWED = new Set([
  'lib/data/ronda-libre-scores.ts',
  'app/api/admin/actions/force-close/route.ts',
  'app/api/admin/rondas-libres/[id]/route.ts',
  'lib/data/tournaments/lifecycle.ts',
])

describe('canario — caminos de escritura de ronda libre avisan a los seguidores', () => {
  it('la RPC upsert_ronda_libre_scores sólo se llama desde la capa de datos (o rutas que empujan)', () => {
    const offenders = files
      .filter(f => f.text.includes("upsert_ronda_libre_scores") && !RPC_ALLOWED.has(f.file))
      .map(f => f.file)
    expect(offenders, 'usá saveRondaLibreScores() de src/lib/data/ronda-libre-scores.ts').toEqual([])
  })

  it("nadie cierra una ronda libre (estado: 'finalizada') por fuera de los caminos que empujan", () => {
    const offenders = files
      .filter(f => /rondas_libres[\s\S]{0,200}estado: 'finalizada'|estado: 'finalizada'[\s\S]{0,200}rondas_libres/.test(f.text))
      .filter(f => !FINALIZE_ALLOWED.has(f.file))
      .map(f => f.file)
    expect(offenders, 'usá finalizarRondaLibre() de src/lib/data/ronda-libre-scores.ts').toEqual([])
  })

  it('la capa de datos dispara el push al guardar y al finalizar', () => {
    const text = files.find(f => f.file === 'lib/data/ronda-libre-scores.ts')?.text ?? ''
    expect(text).toContain('triggerRoundUpdatePush(input.codigo)')
    expect(text).toContain("triggerRoundUpdatePush(codigo, { force: true })")
  })

  it('cada ruta del servidor que escribe llama a pushRoundUpdate', () => {
    for (const file of [...RPC_ALLOWED, ...FINALIZE_ALLOWED].filter(f => f !== 'lib/data/ronda-libre-scores.ts')) {
      const text = files.find(f => f.file === file)?.text
      expect(text, `${file} existe`).toBeDefined()
      expect(text, `${file} llama pushRoundUpdate`).toContain('pushRoundUpdate(')
    }
  })

  it('los scorers (individual, grupo/admin, finalizar) usan la capa de datos', () => {
    for (const file of [
      'app/ronda-libre/[codigo]/score/hooks/useScoreSave.ts',
      'app/ronda-libre/[codigo]/score/page.tsx',
      'app/ronda-libre/[codigo]/score-grupo/page.tsx',
      'app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda.ts',
    ]) {
      const text = files.find(f => f.file === file)?.text ?? ''
      expect(text, file).toMatch(/saveRondaLibreScores\(|finalizarRondaLibre\(/)
    }
  })
})
