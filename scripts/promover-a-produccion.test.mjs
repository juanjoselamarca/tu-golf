import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CHECK_VERIFICACION, RAMA_PROD, decidirPromocion, faltasDeMain } from './promover-a-produccion.mjs'

const verificacion = { name: CHECK_VERIFICACION, status: 'completed', conclusion: 'success' }
const vercel = { context: 'Vercel', state: 'success' }
const sinEvento = { evento: false, motivo: 'sin rondas reales en juego' }

describe('faltasDeMain', () => {
  it('nada falta con todo terminado en verde, skipped incluido', () => {
    const checkRuns = [verificacion, { name: 'Esquema', status: 'completed', conclusion: 'skipped' }]
    expect(faltasDeMain({ checkRuns, statuses: [vercel] })).toEqual([])
  })

  it('un check en curso, uno rojo y un estado pendiente de Vercel faltan', () => {
    const checkRuns = [verificacion, { name: 'Integración', status: 'in_progress', conclusion: null }, { name: 'Scorer', status: 'completed', conclusion: 'failure' }]
    expect(faltasDeMain({ checkRuns, statuses: [{ context: 'Vercel', state: 'pending' }] }))
      .toEqual(['Integración: in_progress', 'Scorer: failure', 'Vercel: pending'])
  })

  it('recién mergeado, sin la Verificación todavía, no está listo', () => {
    expect(faltasDeMain({ checkRuns: [], statuses: [] })).toEqual([`${CHECK_VERIFICACION}: todavía no corre`])
  })

  it('el nombre del check es el del job verify de ci.yml', () => {
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain(`name: ${CHECK_VERIFICACION}\n`)
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
