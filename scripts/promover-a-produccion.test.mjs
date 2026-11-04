import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { MENSAJE_NOCHE, RAMA_PROD, WORKFLOW_CI, decidirPromocion, faltasDeMain } from './promover-a-produccion.mjs'

const ci = { name: WORKFLOW_CI, status: 'completed', conclusion: 'success' }
const vercel = { context: 'Vercel', state: 'success' }
const sinEvento = { evento: false, motivo: 'sin rondas reales en juego' }

describe('faltasDeMain', () => {
  it('nada falta con todo terminado en verde, skipped incluido', () => {
    const runs = [ci, { name: 'Esquema', status: 'completed', conclusion: 'skipped' }]
    expect(faltasDeMain({ runs, statuses: [vercel] })).toEqual([])
  })

  it('una corrida en curso, una roja y un estado pendiente de Vercel faltan', () => {
    const runs = [ci, { name: 'Integración', status: 'in_progress', conclusion: null }, { name: 'Scorer', status: 'completed', conclusion: 'failure' }]
    expect(faltasDeMain({ runs, statuses: [{ context: 'Vercel', state: 'pending' }] }))
      .toEqual(['Integración: in_progress', 'Scorer: failure', 'Vercel: pending'])
  })

  it('recién mergeado, sin la corrida de CI todavía, no está listo', () => {
    expect(faltasDeMain({ runs: [], statuses: [] })).toEqual([`${WORKFLOW_CI}: todavía no corre`])
  })

  it('el nombre es el del workflow de ci.yml', () => {
    // `\r?`: en Windows autocrlf entrega ci.yml con CRLF y el verify del pre-push fallaba (03-nov-2026).
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toMatch(new RegExp(`^name: ${WORKFLOW_CI}\r?\n`))
  })
})

describe('decidirPromocion', () => {
  it('con evento en vivo no promueve, aunque main esté lista (exit 3)', () => {
    const d = decidirPromocion({ evento: { evento: true, motivo: '1 ronda(s) en juego: 6JZ1N6' }, faltas: [], comparacion: 'ahead' })
    expect(d).toMatchObject({ promover: false, exit: 3 })
    expect(d.motivo).toContain('6JZ1N6')
  })

  it('con main sin terminar no promueve (exit 1)', () => {
    expect(decidirPromocion({ evento: sinEvento, faltas: ['Integración: in_progress'], comparacion: 'ahead' }))
      .toMatchObject({ promover: false, exit: 1 })
  })

  it('promueve un avance fast-forward y crea la rama si no existe', () => {
    expect(decidirPromocion({ evento: sinEvento, faltas: [], comparacion: 'ahead' }).promover).toBe(true)
    expect(decidirPromocion({ evento: sinEvento, faltas: [], comparacion: 'sin-rama' }).promover).toBe(true)
  })

  it('production en el mismo commit: nada que hacer (exit 0)', () => {
    expect(decidirPromocion({ evento: sinEvento, faltas: [], comparacion: 'identical' })).toMatchObject({ promover: false, exit: 0 })
  })

  it(`${RAMA_PROD} con commits que main no tiene no se pisa`, () => {
    for (const comparacion of ['diverged', 'behind']) {
      expect(decidirPromocion({ evento: sinEvento, faltas: [], comparacion })).toMatchObject({ promover: false, exit: 1 })
    }
  })
})

describe('sesión nocturna', () => {
  it('con CEO_NIGHT se niega sin llamar a GitHub ni a prod (exit 1)', () => {
    const r = spawnSync(process.execPath, ['scripts/promover-a-produccion.mjs'], {
      encoding: 'utf8',
      env: { PATH: '', CEO_NIGHT: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://hoswfwhvcgqlqdmzpnce.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x' },
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(MENSAJE_NOCHE)
  })
})
