// Canario: `players.pending_user_id` se lee SÓLO en el servidor (service role).
// Bug (16-oct-2026): esa columna es el `guestId` del invitado de torneo, su credencial —
// con él, /guest-join entregaba su token (anotar golpes por él) y /guest-claim lo pasaba a
// otra cuenta. La tabla players la exponía a cualquiera con la anon key. La migración
// players_hide_pending_user_id le quita el SELECT a anon/authenticated: si algún código
// con el cliente de la sesión la vuelve a pedir, esa pantalla recibe 42501 (el scorer del
// torneo la pedía en su roster). Este canario lo frena antes.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const ROOT = process.cwd()

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'node_modules' ? [] : archivos(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

const rel = (p: string) => relative(ROOT, p).split(sep).join('/')

/** Leen la columna con el service role (createAdminClient / serviceClient). */
const SERVIDOR = [
  'src/app/api/game/route.ts',
  'src/app/api/torneos/[slug]/guest-claim/route.ts',
  'src/app/api/torneos/[slug]/guest-join/route.ts',
  'src/lib/data/tournaments/guest-player.ts',
]
/** Seeds locales (service role, no corren en la app). */
const SCRIPTS = 'src/scripts/'

const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('players.pending_user_id sólo en el servidor', () => {
  const usos = archivos(join(ROOT, 'src'))
    .map((p) => ({ ruta: rel(p), src: sinComentarios(readFileSync(p, 'utf8')) }))
    .filter((f) => f.src.includes('pending_user_id'))
    .map((f) => f.ruta)

  it('nadie fuera de las rutas con service role la nombra en código', () => {
    expect(usos.filter((r) => !SERVIDOR.includes(r) && !r.startsWith(SCRIPTS))).toEqual([])
  })

  it('la lista de rutas permitidas no tiene entradas muertas', () => {
    for (const r of SERVIDOR) expect(usos).toContain(r)
  })
})
