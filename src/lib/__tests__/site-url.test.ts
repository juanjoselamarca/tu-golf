import { describe, it, expect } from 'vitest'
import { normalizarSiteUrl } from '../site-url'

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
