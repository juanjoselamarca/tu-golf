// Cuenta de stats tocadas del scorer del organizador. Revisión Fable #834 v2 (P2-f): `reconciliar` comparaba por
// valor, así que GIR Sí → No → Sí con el primer envío (Sí) confirmado tarde dejaba de viajar el último Sí, aunque
// el envío del No pudo haberse aplicado después en el servidor.

import { describe, it, expect } from 'vitest'
import { claveHoyo, crearColaHoyos, leerTocadas, reconciliar, SIN_TOCAR, tocadasDeLaRonda, tocar } from './envio-hoyo'

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

function diferida() {
  let soltar!: () => void
  const promesa = new Promise<void>((res) => { soltar = res })
  return { promesa, soltar }
}
const microtareas = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

describe('envio-hoyo · cola serial por hoyo (#834 v5)', () => {
  it('claveHoyo es la única forma de la clave', () => {
    expect(claveHoyo('r1', 7)).toBe('r1:7')
  })

  it('el segundo envío del hoyo sale recién cuando terminó el primero, aunque el primero falle', async () => {
    const cola = crearColaHoyos()
    const orden: string[] = []
    const primero = diferida()
    const uno = cola.encolar('r1', 1, async () => { orden.push('sale 1'); await primero.promesa; throw new Error('red') })
    const dos = cola.encolar('r1', 1, async () => { orden.push('sale 2') })
    await microtareas()
    expect(orden).toEqual(['sale 1'])
    primero.soltar()
    await expect(uno).rejects.toThrow('red')
    await dos
    expect(orden).toEqual(['sale 1', 'sale 2'])
  })

  it('vaciar espera también lo que se encola mientras tanto, y sólo de su ronda', async () => {
    const cola = crearColaHoyos()
    const a = diferida()
    const otra = diferida()
    void cola.encolar('r2', 1, () => otra.promesa)
    void cola.encolar('r1', 1, () => a.promesa)
    let vacia = false
    const espera = cola.vaciar('r1').then(() => { vacia = true })
    const b = diferida()
    void cola.encolar('r1', 2, () => b.promesa)
    a.soltar()
    await microtareas()
    expect(vacia).toBe(false)
    b.soltar()
    await espera
    expect(vacia).toBe(true) // la ronda r2 sigue con su envío colgado y no la frena
    otra.soltar()
  })

  it('la carga siembra los golpes confirmados sin pisar un hoyo con envíos en la cola', async () => {
    const cola = crearColaHoyos()
    cola.confirmarGolpe('r1', 1, 5)
    cola.confirmarGolpe('r1', 3, 6)
    cola.confirmarGolpe('r2', 1, 9)
    const enVuelo = diferida()
    const envio = cola.encolar('r1', 1, () => enVuelo.promesa)
    cola.sembrarGolpes('r1', { 1: 4, 2: 3 }, cola.marca())
    expect(cola.golpeConfirmado('r1', 1)).toBe(5) // su confirmado lo dará la respuesta, no una carga vieja
    expect(cola.golpeConfirmado('r1', 2)).toBe(3)
    expect(cola.golpeConfirmado('r1', 3)).toBeUndefined() // ya no está en la base
    expect(cola.golpeConfirmado('r2', 1)).toBe(9) // otra ronda: intacta
    enVuelo.soltar()
    await envio
  })

  it('una lectura pedida antes de que se confirmara un golpe no lo pisa al llegar (A → B → A con guardado lento)', () => {
    const cola = crearColaHoyos()
    const marca = cola.marca() // se pide la lectura
    cola.confirmarGolpe('r1', 1, 5) // mientras viaja, se confirma el 5
    cola.sembrarGolpes('r1', { 1: 4, 2: 3 }, marca) // llega con la base de antes
    expect(cola.golpeConfirmado('r1', 1)).toBe(5)
    expect(cola.golpeConfirmado('r1', 2)).toBe(3)
  })

  it('un envío incierto deja el hoyo en "no se sabe" hasta una lectura pedida después', () => {
    const cola = crearColaHoyos()
    cola.confirmarGolpe('r1', 7, 4)
    const vieja = cola.marca()
    cola.olvidarGolpe('r1', 7)
    expect(cola.golpeConfirmado('r1', 7)).toBeUndefined()
    expect(cola.hoyosInciertos('r1')).toEqual([7])
    cola.sembrarGolpes('r1', { 7: 4 }, vieja) // lectura pedida antes del envío: no dice nada de él
    expect(cola.hoyosInciertos('r1')).toEqual([7])
    cola.sembrarGolpes('r1', { 7: 5 }, cola.marca())
    expect(cola.golpeConfirmado('r1', 7)).toBe(5)
    expect(cola.hoyosInciertos('r1')).toEqual([])
  })
})
