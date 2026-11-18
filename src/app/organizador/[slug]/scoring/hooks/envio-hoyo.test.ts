// Cuenta de stats tocadas del scorer del organizador. Revisión Fable #834 v2 (P2-f): `reconciliar` comparaba por
// valor, así que GIR Sí → No → Sí con el primer envío (Sí) confirmado tarde dejaba de viajar el último Sí, aunque
// el envío del No pudo haberse aplicado después en el servidor.

import { describe, it, expect } from 'vitest'
import { leerTocadas, reconciliar, SIN_TOCAR, tocadasDeLaRonda, tocar } from './envio-hoyo'

describe('envio-hoyo · reconciliar por versión', () => {
  it('A → B → A: confirmar el primer envío no saca el último toque, aunque tenga el mismo valor', () => {
    const uno = tocar(SIN_TOCAR, 'r1', 1, { gir: true })
    const dos = tocar(uno.tocadas, 'r1', 1, { gir: false })
    const tres = tocar(dos.tocadas, 'r1', 1, { gir: true })
    const t = reconciliar(tres.tocadas, 'r1', 1, uno.versiones)
    expect(leerTocadas(t, 'r1', 1).foto).toEqual({ gir: true })
  })

  it('confirmar el envío vigente saca sólo lo que viajó en él', () => {
    const uno = tocar(SIN_TOCAR, 'r1', 1, { gir: true, putts: 2 })
    const dos = tocar(uno.tocadas, 'r1', 1, { putts: 3 })
    const t = reconciliar(dos.tocadas, 'r1', 1, uno.versiones)
    expect(leerTocadas(t, 'r1', 1).foto).toEqual({ putts: 3 })
    expect(leerTocadas(reconciliar(t, 'r1', 1, dos.versiones), 'r1', 1).foto).toEqual({})
  })

  it('lo de otra ronda no viaja ni se superpone', () => {
    const { tocadas } = tocar(SIN_TOCAR, 'r1', 1, { gir: false })
    expect(leerTocadas(tocadas, 'r2', 1).foto).toEqual({})
    expect(tocadasDeLaRonda(tocadas, 'r2')).toEqual({})
    expect(tocadasDeLaRonda(tocadas, 'r1')).toEqual({ 1: { gir: false } })
  })
})
