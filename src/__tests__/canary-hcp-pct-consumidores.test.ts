/**
 * CANARIO — el handicap de juego del torneo (`tournaments.hcp_pct`) llega a
 * TODOS los que reparten golpes, y se aplica en UN solo lugar.
 *
 * El % se aplica dentro del gate (`resolveScoringCourseHcp`, vía
 * `handicapDeJuego` de `@/golf/core/playing-handicap`). Para que el scorer del
 * organizador, el del jugador, el servidor (`upsert_score`), el board y el GWI
 * vean el mismo número, cada uno tiene que (1) leer la columna y (2) pasarla al
 * gate. Si uno se queda al 100 % en silencio, la tarjeta guarda un neto y el
 * board muestra otro: en un torneo neto eso decide el campeonato.
 *
 * Son alambres de tropiezo sobre el FUENTE (misma técnica y mismos límites que
 * `canary-scorer-jugador-handicap.test.ts`): cazan el revert y el copy-paste,
 * no siguen el flujo de datos. La paridad de NÚMEROS scorer === board vive en
 * `src/golf/leaderboard/build-from-legacy-hcp.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')

/** Todos los .ts/.tsx productivos (sin tests) de un directorio y sus subdirectorios. */
function archivosDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : archivosDe(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const rel = (abs: string) => abs.slice(SRC.length + 1).replace(/\\/g, '/')

const PRODUCTIVOS = archivosDe(SRC)

/** El fuente sin comentarios: un docblock que NOMBRA el % no es una cuenta. */
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** El texto de la llamada `fn({ ... })` que empieza en `desde`, hasta su `)` de cierre. */
function llamada(src: string, desde: number): string {
  let depth = 0
  for (let i = src.indexOf('(', desde); i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return src.slice(desde, i + 1)
  }
  return src.slice(desde)
}

describe('canario · cada llamada al gate pasa el handicap de juego del torneo', () => {
  const llamadas = PRODUCTIVOS.flatMap((f) => {
    const src = readFileSync(f, 'utf8')
    const out: Array<{ archivo: string; texto: string }> = []
    for (const m of src.matchAll(/courseHandicapDeScoring\(\{/g)) {
      out.push({ archivo: rel(f), texto: llamada(src, m.index!) })
    }
    return out
  })

  it('hay llamadas que revisar (guard de cardinalidad: el canario no pasa en vacío)', () => {
    // organizador ×2, jugador ×1, servidor ×1, GWI ×1
    expect(llamadas.length).toBeGreaterThanOrEqual(5)
  })

  it('ninguna llamada a courseHandicapDeScoring omite hcpPct ni lo fija al 100 % a mano', () => {
    for (const { archivo, texto } of llamadas) {
      const m = texto.match(/hcpPct:\s*([^,\n}]+)/)
      expect(m, `${archivo}: courseHandicapDeScoring sin hcpPct`).not.toBeNull()
      // El valor sale de la fila del torneo (`hcpPctDelTorneo`) o del contexto
      // que ya lo trae resuelto (`.hcpPct`). Un literal es un torneo al 100 % disfrazado.
      expect(m![1], `${archivo}: hcpPct no viene del torneo`).toMatch(/hcpPctDelTorneo\(|\.hcpPct\b/)
    }
  })

  it('el board pasa el % del contexto al gate', () => {
    const src = leer('golf/leaderboard/build-from-legacy.ts')
    const i = src.indexOf('resolveScoringCourseHcp(')
    expect(i).toBeGreaterThan(-1)
    expect(llamada(src, i)).toMatch(/hcpCtx\?\.hcpPct/)
  })

  it('el contexto del board calcula el % con la canónica (equipos y gross → 100)', () => {
    const src = leer('lib/data/tournaments/leaderboard.ts')
    expect(src).toMatch(/hcpPct:\s*hcpPctEfectivo\(/)
  })
})

describe('canario · las lecturas de tournaments que alimentan el gate traen hcp_pct', () => {
  // Cada uno de estos SELECT termina en el gate. Sin la columna, `hcpPctDelTorneo`
  // la ve como ausente y el torneo se juega al 100 % sin que nada falle.
  const LECTURAS: Array<[string, RegExp]> = [
    ['lib/data/tournaments/leaderboard.ts', /'course_id, tees, hcp_calc_mode, hcp_pct, '/],
    ['lib/data/tournaments/leaderboard.ts', /select\(`tees, hcp_calc_mode, hcp_pct, modo_juego, formato_juego, format,/],
    ['lib/data/tournaments/scoring.ts', /hcp_calc_mode, hcp_pct,/],
    ['lib/data/tournaments/en-vivo.ts', /hcp_calc_mode, hcp_pct,/],
    ['lib/data/tournaments/tvBoard.ts', /hcp_calc_mode, hcp_pct,/],
    ['lib/data/gwi-torneo.ts', /hcp_calc_mode, hcp_pct,/],
  ]
  it.each(LECTURAS)('%s pide hcp_pct', (archivo, re) => {
    expect(leer(archivo)).toMatch(re)
  })
})

describe('canario · el % se multiplica en UN solo lugar', () => {
  it('ningún archivo fuera de playing-handicap.ts multiplica o divide por el porcentaje', () => {
    const ofensores = PRODUCTIVOS.filter((f) => !f.endsWith('playing-handicap.ts')).filter((f) =>
      /[*/]\s*\(?\s*[\w.?]*\b(hcpPct|hcp_pct)\b|\b(hcpPct|hcp_pct)\s*[*/]/.test(sinComentarios(readFileSync(f, 'utf8'))),
    )
    expect(ofensores.map(rel)).toEqual([])
  })

  it('la canónica sí lo hace (si se mueve, este canario tiene que seguirla)', () => {
    expect(leer('golf/core/playing-handicap.ts')).toMatch(/courseHandicap \* hcpPct/)
  })
})
