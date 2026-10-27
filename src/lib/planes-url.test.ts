import { describe, expect, it } from 'vitest'
import { destinoDeVolverDePlanes, planesUrl } from './planes-url'

describe('planesUrl', () => {
  it('lleva la ruta de origen', () => {
    expect(planesUrl('/ronda-libre/nueva')).toBe('/planes?volver=%2Fronda-libre%2Fnueva')
    expect(planesUrl('/organizador/nuevo?paso=2')).toBe('/planes?volver=%2Forganizador%2Fnuevo%3Fpaso%3D2')
  })
  it('sin origen útil, /planes a secas', () => {
    expect(planesUrl()).toBe('/planes')
    expect(planesUrl('/dashboard')).toBe('/planes')
    expect(planesUrl('/planes')).toBe('/planes')
    expect(planesUrl('https://phishing.example')).toBe('/planes')
  })
})

describe('destinoDeVolverDePlanes', () => {
  it('vuelve a la ruta interna de origen', () => {
    expect(destinoDeVolverDePlanes('/ronda-libre/nueva')).toBe('/ronda-libre/nueva')
  })
  it('sin parámetro o con uno externo/raro: dashboard', () => {
    expect(destinoDeVolverDePlanes(null)).toBe('/dashboard')
    expect(destinoDeVolverDePlanes('//evil.com')).toBe('/dashboard')
    expect(destinoDeVolverDePlanes('https://evil.com')).toBe('/dashboard')
    expect(destinoDeVolverDePlanes('/..//evil.com')).toBe('/dashboard')
    expect(destinoDeVolverDePlanes('/planes?volver=/x')).toBe('/dashboard')
  })
})
