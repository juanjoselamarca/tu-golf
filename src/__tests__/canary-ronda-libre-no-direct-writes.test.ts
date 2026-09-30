// Canario: el navegador nunca hace UPDATE/DELETE directo sobre las tablas de
// ronda libre. P0 29-sep-2026: las guardas "demo read-only" eran PERMISSIVE y
// dejaban a cualquiera (hasta anónimo) modificar o borrar rondas ajenas. Varios
// flujos (finalizar, descartar, reclamar tarjetas de invitado) funcionaban solo
// gracias a ese hueco. Cerrado el hueco, un UPDATE/DELETE sin permiso devuelve
// 0 filas SIN error y la UI diría "listo" sin que pase nada.
//
// Toda escritura va por los RPCs que deciden quién puede
// (`upsert_ronda_libre_scores`, `upsert_ronda_equipos_scores`,
// `finalizar_ronda_libre`, `descartar_ronda_libre`) o por el servidor con
// service role después de validar al usuario.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const TABLAS = /\.from\(\s*['"](rondas_libres|ronda_libre_jugadores|ronda_equipos)['"]\s*\)/g
const ESCRITURA = /\.(update|delete|upsert)\(/

/** Módulos de servidor con cliente service role (validan permisos antes). */
const SERVIDOR_PERMITIDO = new Set([
  'src/lib/data/ronda-libre-guest-claim.ts', // callback de auth, cliente admin
  'src/lib/data/tournaments/lifecycle.ts', // acciones de organizador vía /api/game (svc)
])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) {
      return f === '__tests__' || f === 'api' || f === 'scripts' ? [] : files(p)
    }
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

/**
 * Cadena de la query: el resto de la línea del `.from(...)` más las líneas
 * siguientes que continúan la cadena (empiezan con `.`). El repo no usa `;`.
 */
function cadenas(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(TABLAS)) {
    const [primera, ...siguientes] = src.slice(m.index! + m[0].length).split('\n')
    const cadena = [primera.split(';')[0]]
    for (const l of siguientes) {
      if (!l.trimStart().startsWith('.')) break
      cadena.push(l)
    }
    out.push(cadena.join('\n'))
  }
  return out
}

describe('canario — sin escrituras directas a ronda libre desde el cliente', () => {
  it('fuera de src/app/api, nadie hace update/delete/upsert sobre rondas_libres, ronda_libre_jugadores ni ronda_equipos', () => {
    const todos = files('src').map((p) => relative(process.cwd(), p).split(sep).join('/'))
    // El barrido tiene que ver los scorers (si no, el canario pasa en vacío).
    expect(todos).toContain('src/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda.ts')
    expect(todos).toContain('src/app/ronda-libre/[codigo]/score-grupo/page.tsx')
    const offenders = todos
      .filter((p) => !SERVIDOR_PERMITIDO.has(p))
      .filter((p) => cadenas(readFileSync(p, 'utf8')).some((c) => ESCRITURA.test(c)))
    expect(offenders).toEqual([])
  })

  it('el detector ve las formas reales del bug (encadenado en varias líneas)', () => {
    const bug = `await supabase.from('rondas_libres')\n  .update({ estado: 'finalizada' })\n  .eq('codigo', codigo)`
    const bugDelete = `const { error: e1 } = await supabase.from('ronda_libre_jugadores').delete().eq('ronda_id', id)`
    const lectura = `const { data } = await supabase.from('rondas_libres').select('id').eq('codigo', c)\nawait x.update()`
    expect(cadenas(bug).some((c) => ESCRITURA.test(c))).toBe(true)
    expect(cadenas(bugDelete).some((c) => ESCRITURA.test(c))).toBe(true)
    expect(cadenas(lectura).some((c) => ESCRITURA.test(c))).toBe(false)
  })
})
