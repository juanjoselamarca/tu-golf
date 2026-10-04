import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rondasEnVivo, ventanaActiva, consultarEvento, USUARIOS_DE_PRUEBA } from './evento-en-vivo.mjs'

const AHORA = Date.parse('2026-10-04T13:00:00Z') // 10:00 Chile, en plena ronda del 04-oct
const hace = (min) => new Date(AHORA - min * 60_000).toISOString()
const ronda = (o = {}) => ({
  codigo: 'B4F5Y2', estado: 'en_curso', es_demo: false, course_name: 'Club de Golf Los Leones',
  creador_id: '98c5cb7a', created_at: hace(73), ronda_libre_jugadores: [{ scores: { 11: 4 } }], ...o,
})

describe('evento en vivo — congelamiento de CI/merges (incidente 04-oct)', () => {
  it('la ronda de Juanjo del 04-oct a las 10:00 cuenta como evento', () => {
    expect(rondasEnVivo([ronda()], AHORA).map(r => r.codigo)).toEqual(['B4F5Y2'])
  })
  it('no cuentan: demo, QA, usuario de E2E, recién creadas (fixtures), > 6 h, finalizadas, sin hoyos', () => {
    const fuera = [
      ronda({ es_demo: true }),
      ronda({ course_name: 'QA_LEONES_TORNEO' }),
      ronda({ creador_id: USUARIOS_DE_PRUEBA[0] }),
      ronda({ created_at: hace(5) }),
      ronda({ created_at: hace(7 * 60) }),
      ronda({ estado: 'finalizada' }),
      ronda({ ronda_libre_jugadores: [{ scores: {} }] }),
    ]
    expect(rondasEnVivo(fuera, AHORA)).toEqual([])
  })
  it('ventana declarada activa (torneo agendado) congela aunque no haya rondas', async () => {
    const ventanas = [{ desde: '2026-10-04T10:30:00Z', hasta: '2026-10-04T18:00:00Z', motivo: 'Torneo Los Leones' }]
    expect(ventanaActiva(ventanas, AHORA)?.motivo).toBe('Torneo Los Leones')
    const r = await consultarEvento({ ahora: AHORA, ventanas, url: 'x', key: 'y', fetchImpl: () => { throw new Error('no debe consultar') } })
    expect(r.evento).toBe(true)
  })
  it('BD caída o con error → congela por precaución (fail-closed)', async () => {
    const caida = await consultarEvento({ ahora: AHORA, ventanas: [], url: 'u', key: 'k', fetchImpl: async () => { throw new Error('timeout') } })
    expect(caida.evento).toBe(true)
    const e503 = await consultarEvento({ ahora: AHORA, ventanas: [], url: 'u', key: 'k', fetchImpl: async () => ({ ok: false, status: 503 }) })
    expect(e503.evento).toBe(true)
  })
  it('sin rondas reales → libre', async () => {
    const r = await consultarEvento({ ahora: AHORA, ventanas: [], url: 'u', key: 'k', fetchImpl: async () => ({ ok: true, json: async () => [ronda({ es_demo: true })] }) })
    expect(r.evento).toBe(false)
  })
  it('sin credenciales (fork/local) → no bloquea', async () => {
    expect((await consultarEvento({ ahora: AHORA, ventanas: [] })).evento).toBe(false)
  })
})

describe('todo paso de turno de prod recibe las credenciales del congelamiento', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github', 'workflows')
  for (const f of readdirSync(dir).filter(x => x.endsWith('.yml'))) {
    const yml = readFileSync(resolve(dir, f), 'utf8')
    if (!yml.includes('wait-prod-turn.mjs')) continue
    it(f, () => {
      const pasos = yml.split('node scripts/ci/wait-prod-turn.mjs').slice(1)
      for (const p of pasos) {
        const bloque = p.split(/\n\s*- name:/)[0]
        expect(bloque).toContain('EVENTO_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}')
        expect(bloque).toContain('EVENTO_SUPABASE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}')
      }
    })
  }
})
