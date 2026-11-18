/**
 * Canario (Fable #829): el estado del jugador (`players.status`) se lee de src/golf/tournament-status —
 * `INSCRITO_APROBADO_STATUS` para quién juega/ocupa cupo y `jugadorFueraDelTorneo()` para WD/DQ. La hoja de
 * salida, el cupo de la inscripción y /api/game repetían los literales: si el estado cambiaba en un lado, uno
 * mostraba o dejaba anotar a quien el otro no.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** El código sin comentarios (los comentarios pueden nombrar los estados). */
const codigo = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const ARCHIVOS = [
  'src/lib/data/tournaments/hoja-salida.ts',
  'src/lib/data/tournaments/enrollPlayer.ts',
  'src/app/api/game/route.ts',
]

describe('canario: estados del jugador desde la fuente canónica', () => {
  it.each(ARCHIVOS)('%s no repite los literales de players.status', (rel) => {
    expect(codigo(rel)).not.toMatch(/'(approved|withdrawn|disqualified)'/)
  })
})
