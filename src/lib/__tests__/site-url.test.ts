import { describe, it, expect } from 'vitest'
import { normalizarSiteUrl, urlInscripcion, urlTorneo, SITE_URL } from '../site-url'

describe('normalizarSiteUrl', () => {
  it('recorta el salto de línea con que quedó guardada la variable en Vercel', () => {
    // Prod 09-oct: el link de invitación por WhatsApp salía "…vercel.app%0A%2Ftorneo%2F…".
    expect(normalizarSiteUrl('https://golfersplus.vercel.app\n')).toBe('https://golfersplus.vercel.app')
    expect(normalizarSiteUrl('  https://golfersplus.vercel.app\r\n')).toBe('https://golfersplus.vercel.app')
  })

  it('quita la "/" final para que `${SITE_URL}/ruta` no quede con doble barra', () => {
    expect(normalizarSiteUrl('https://golfersplus.vercel.app/')).toBe('https://golfersplus.vercel.app')
  })

  it('sin variable (o vacía) usa el dominio de prod', () => {
    expect(normalizarSiteUrl(undefined)).toBe('https://golfersplus.vercel.app')
    expect(normalizarSiteUrl(' \n')).toBe('https://golfersplus.vercel.app')
  })
})

describe('links que se reparten fuera de la app', () => {
  it('la inscripción y el torneo salen del sitio público, no del origen del navegador', () => {
    // El QR se imprime y el link se manda por WhatsApp: si heredaran
    // `window.location.origin`, un organizador entrado por un preview de Vercel
    // (o por localhost) repartiría un link que el jugador no puede abrir.
    expect(urlInscripcion('copa-primavera')).toBe(`${SITE_URL}/torneo/copa-primavera/unirse`)
    expect(urlTorneo('copa-primavera')).toBe(`${SITE_URL}/torneo/copa-primavera`)
    expect(urlInscripcion('copa-primavera').startsWith('https://')).toBe(true)
  })

  it('no deja doble barra ni arrastra el salto de línea de la variable', () => {
    expect(urlInscripcion('x')).not.toMatch(/\/\/torneo|%0A|\n/)
  })
})
