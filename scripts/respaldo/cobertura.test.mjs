import { describe, it, expect } from 'vitest'
import { avisosDeCobertura } from './cobertura.mjs'

const PUBLIC_Y_AUTH = ['public.courses', 'public.profiles', 'auth.users']
const AYER = dia => ({ dia, tablas: Object.fromEntries(PUBLIC_Y_AUTH.map(t => [t, { filas: 1, bytes: 1 }])) })

describe('avisosDeCobertura', () => {
  it('un día normal no avisa nada', () => {
    expect(avisosDeCobertura({
      schemasExistentes: ['public', 'respaldos'],
      tablas: [...PUBLIC_Y_AUTH, 'respaldos.yardaje_blanco_dorado_20261030'],
      previo: AYER('2026-10-30'),
    })).toEqual([])
  })

  it('un schema que existe sin aportar tablas se avisa y se nombra', () => {
    const avisos = avisosDeCobertura({
      schemasExistentes: ['public', 'respaldos'],
      tablas: PUBLIC_Y_AUTH,
      previo: null,
    })
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('respaldos')
    expect(avisos[0]).toMatch(/NO cubre/)
  })

  it('un schema que todavía no existe no es error: su migración no corrió', () => {
    // Es el estado de `respaldos` hasta que se aprueba el workflow `migraciones-prod`.
    expect(avisosDeCobertura({
      schemasExistentes: ['public'],
      tablas: PUBLIC_Y_AUTH,
      previo: null,
    })).toEqual([])
  })

  // El guard del schema solo mira si aportó ALGUNA tabla: es la tolerancia del tamaño del error.
  // Con tres copias en `respaldos` y dos dropeadas, el schema sigue "aportando tablas" y el
  // respaldo pasaría verde justo cuando perdió dos de las tres copias que son el único lugar donde
  // vive ese dato. Por eso el segundo guard compara contra el respaldo de ayer.
  it('caza las tablas que ayer estaban y hoy no, aunque su schema siga aportando otras', () => {
    const avisos = avisosDeCobertura({
      schemasExistentes: ['public', 'respaldos'],
      tablas: [...PUBLIC_Y_AUTH, 'respaldos.copia_c'],
      previo: { dia: '2026-10-30', tablas: { ...AYER('x').tablas, 'respaldos.copia_a': {}, 'respaldos.copia_b': {}, 'respaldos.copia_c': {} } },
    })
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('respaldos.copia_a')
    expect(avisos[0]).toContain('respaldos.copia_b')
    expect(avisos[0]).not.toContain('respaldos.copia_c')
  })

  it('también caza una tabla de public que desapareció, no solo las copias', () => {
    const avisos = avisosDeCobertura({
      schemasExistentes: ['public'],
      tablas: ['public.courses', 'auth.users'],
      previo: AYER('2026-10-30'),
    })
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('public.profiles')
  })

  it('una tabla NUEVA no es un aviso: la cobertura creció', () => {
    expect(avisosDeCobertura({
      schemasExistentes: ['public'],
      tablas: [...PUBLIC_Y_AUTH, 'public.tabla_nueva'],
      previo: AYER('2026-10-30'),
    })).toEqual([])
  })

  it('sin respaldo previo no inventa avisos (primera corrida)', () => {
    expect(avisosDeCobertura({ schemasExistentes: ['public'], tablas: PUBLIC_Y_AUTH, previo: null })).toEqual([])
  })

  it('el aviso dice la fecha del respaldo con que se comparó', () => {
    const [aviso] = avisosDeCobertura({
      schemasExistentes: ['public'],
      tablas: ['public.courses'],
      previo: AYER('2026-10-28'),
    })
    expect(aviso).toContain('2026-10-28')
  })

  it('no explota con un manifiesto previo sin tablas', () => {
    expect(avisosDeCobertura({ schemasExistentes: ['public'], tablas: PUBLIC_Y_AUTH, previo: { dia: '2026-10-30' } })).toEqual([])
  })
})
