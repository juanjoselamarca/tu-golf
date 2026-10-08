/**
 * Canario: Golfers+ NO usa Supabase Realtime.
 *
 * Incidente torneo Los Leones (04-oct-2026): cada arranque del tenant de Realtime
 * hace DDL ("Creating partitions for realtime.messages") → PostgREST recarga su
 * schema cache → con la base cargada la recarga cae por statement timeout → API
 * caída en pleno torneo. El tenant sólo se activa con clientes conectados (0 logs
 * en 24 h sin rondas en vivo), así que la única defensa es no conectar nunca.
 *
 * Las vistas en vivo hacen polling (`useLivePoll`) contra rutas cacheables en el
 * CDN (`/api/ronda-libre/[codigo]/live`). Falla si alguien vuelve a abrir un canal
 * (`.channel(`), a escuchar `postgres_changes` o a mandar un broadcast, en
 * CUALQUIER archivo de src/ (código, tests y scripts incluidos: un test que mockea
 * un canal es la semilla del próximo uso).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src')
const ESTE = path.resolve(SRC, '__tests__', 'canary-no-realtime.test.ts')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && p !== ESTE) out.push(p)
  }
  return out
}

// Con clases de un carácter ([e], [_]...) para que un grep no encuentre este archivo.
const PROHIBIDOS: Array<[string, RegExp]> = [
  ['.channel(', /\.chann[e]l\s*\(/],
  ['postgres_changes', /postgre[s]_changes/],
  ["on('broadcast') / type: 'broadcast'", /(\.on\s*\(\s*|type\s*:\s*)['"]broadcas[t]['"]/],
  ['removeChannel / removeAllChannels', /remov[e](All)?Channels?\s*\(/],
]

describe('canario: sin Supabase Realtime en src/', () => {
  const archivos = walk(SRC)

  it('recorre src/ de verdad (guard de cardinalidad)', () => {
    expect(archivos.length).toBeGreaterThan(500)
  })

  for (const [nombre, patron] of PROHIBIDOS) {
    it(`nadie usa ${nombre}`, () => {
      const usos = archivos
        .filter(p => patron.test(readFileSync(p, 'utf8')))
        .map(p => path.relative(SRC, p).split(path.sep).join('/'))
      expect(usos).toEqual([])
    })
  }
})
