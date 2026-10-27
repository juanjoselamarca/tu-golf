// Los controles de marca de una pieza de Instagram son lo único que corre ANTES de
// que alguien la mire. Si no cazan nada, la revisión humana recibe basura.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error — módulo .mjs compartido con los scripts de render
import { validarPieza } from '../../../scripts/rrss/validar.mjs'

const RUTA_PIEZA = 'scripts/rrss/piezas/2026-10-27-donde-se-van-los-golpes.json'
const pieza = () => JSON.parse(readFileSync(RUTA_PIEZA, 'utf8'))

describe('controles de marca de una pieza de RRSS', () => {
  it('la pieza que está en el repo pasa todos los controles', () => {
    const p = pieza()
    expect(p.laminas.length).toBe(6) // sin esto el test pasaría con una pieza vacía
    expect(validarPieza(p)).toEqual([])
  })

  it('caza una portada más larga que siete palabras', () => {
    const p = pieza()
    p.laminas[0].titular = 'Esta portada tiene claramente muchas más palabras de las que la guía permite'
    expect(validarPieza(p).join(' ')).toMatch(/lámina 1: \d+ palabras de titular/)
  })

  it('caza una lámina de más de veinte palabras', () => {
    const p = pieza()
    p.laminas[1].cuerpo = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno'
    expect(validarPieza(p).join(' ')).toMatch(/lámina 2: \d+ palabras de titular; el tope es 20/)
  })

  it('caza un emoji en una lámina', () => {
    const p = pieza()
    p.laminas[0].titular = 'Tus golpes 🔥'
    expect(validarPieza(p).join(' ')).toMatch(/lleva emoji/)
  })

  it('caza un número sin pie de fuente', () => {
    const p = pieza()
    delete p.laminas[1].fuente
    expect(validarPieza(p).join(' ')).toMatch(/muestra un número y no lleva pie de fuente/)
  })

  it('caza dos protagonistas en dorado en la misma lámina', () => {
    const p = pieza()
    // La plantilla "numero" ya pinta su número de dorado: una palabra más son dos.
    p.laminas[1].cuerpo = 'El *par 5* es el que más cuesta.'
    expect(validarPieza(p).join(' ')).toMatch(/2 elementos en dorado/)
  })

  it('caza una tabla con dos filas destacadas', () => {
    const p = pieza()
    p.laminas[0].tabla.filas[0].destacada = true
    expect(validarPieza(p).join(' ')).toMatch(/2 elementos en dorado/)
  })

  it('caza voseo argentino en una lámina y en el caption', () => {
    const p = pieza()
    p.laminas[5].cta = 'Anotá tu ronda.'
    p.caption = p.caption.replace('Anota tu próxima ronda', 'Anotá tu próxima ronda')
    const r = validarPieza(p).join(' ')
    expect(r).toMatch(/lámina 6: voseo/)
    expect(r).toMatch(/caption: voseo/)
  })

  it('caza un caption sin el llamado a la acción del público', () => {
    const p = pieza()
    p.caption = 'Un gancho cualquiera sin llamado a la acción.'
    expect(validarPieza(p).join(' ')).toMatch(/falta el llamado a la acción/)
  })

  it('caza un gancho de caption más largo de lo que Instagram muestra', () => {
    const p = pieza()
    p.caption = 'x'.repeat(126) + '\n\n' + p.caption
    expect(validarPieza(p).join(' ')).toMatch(/el gancho tiene 126 caracteres/)
  })

  it('caza hashtags de más y hashtags mal escritos', () => {
    const p = pieza()
    p.hashtags = ['#a', '#b', '#c', '#d', '#e', '#f']
    expect(validarPieza(p).join(' ')).toMatch(/hashtags: 6/)
    p.hashtags = ['#golf chile', '#a', '#b']
    expect(validarPieza(p).join(' ')).toMatch(/no es #unasolapalabra/)
  })

  it('caza un carrusel con menos láminas de las que pide la guía', () => {
    const p = pieza()
    p.laminas = p.laminas.slice(0, 3)
    expect(validarPieza(p).join(' ')).toMatch(/láminas: 3; el carrusel va entre 5 y 8/)
  })
})
