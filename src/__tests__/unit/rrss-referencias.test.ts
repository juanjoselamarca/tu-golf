// El puente inbox → bandeja de referencias decide solo qué reporte del inbox es
// una referencia de RRSS y cuál es un bug. Si se equivoca para un lado, un bug
// real termina como ficha y nadie lo arregla; para el otro, las referencias
// vuelven a quedarse en el inbox y /rrss no las ve (lo que pasaba hasta el
// 19-nov: 14 analizadas, 0 en la bandeja).
import { describe, expect, it } from 'vitest'
import {
  idDeLink,
  linkDeReferencia,
  mimeDeImagen,
  motivoDeFalloDescarga,
  validarAnalisis,
} from '../../../scripts/rrss/referencias.mjs'
import {
  agregarNota,
  ESPERA_MERGE,
  fichaEsperada,
  MAX_PALABRAS_NOTA,
  notaDelReporte,
  reportesDeReferencia,
} from '../../../scripts/rrss/referencias-desde-inbox.mjs'

describe('linkDeReferencia', () => {
  it.each([
    ['https://www.instagram.com/reel/Df3T2_HJgC5/?evlk=MTNu', 'https://www.instagram.com/reel/Df3T2_HJgC5/?evlk=MTNu'],
    ['https://www.instagram.com/reels/Df3T2_HJgC5/', 'https://www.instagram.com/reels/Df3T2_HJgC5/'],
    ['https://www.instagram.com/p/Dd9oSP-pUW3/', 'https://www.instagram.com/p/Dd9oSP-pUW3/'],
    ['https://vt.tiktok.com/ZSpv4bqmC/', 'https://vt.tiktok.com/ZSpv4bqmC/'],
    ['https://www.tiktok.com/@strokesgain/video/7311', 'https://www.tiktok.com/@strokesgain/video/7311'],
    ['mira esto https://youtu.be/abc123 está bueno', 'https://youtu.be/abc123'],
    ['https://www.youtube.com/shorts/xyz', 'https://www.youtube.com/shorts/xyz'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ])('reconoce %s', (texto, esperado) => {
    expect(linkDeReferencia(texto)).toBe(esperado)
  })

  it.each([
    ['un bug sin link', 'El leaderboard no muestra el neto'],
    ['link a GitHub', 'te dejé el PR https://github.com/juanjoselamarca/tu-golf/pull/554'],
    ['link a la app', 'acá falla https://golfersplus.vercel.app/torneos/abc'],
    ['host que solo termina parecido', 'https://notinstagram.com/reel/abc'],
    ['raíz del sitio, sin pieza', 'https://www.instagram.com/'],
    ['un perfil, no una pieza', 'el botón compartir abre https://instagram.com/golfersplus/ mal'],
    ['una story', 'https://www.instagram.com/stories/golfersplus/123/'],
    ['watch sin video', 'https://www.youtube.com/watch'],
    ['vacío', null],
  ])('no confunde %s con una referencia', (_caso, texto) => {
    expect(linkDeReferencia(texto)).toBeNull()
  })
})

describe('idDeLink', () => {
  it('el mismo reel mandado dos veces (distinto token de rastreo) da la misma ficha', () => {
    expect(idDeLink('https://www.instagram.com/reel/Df3T2_HJgC5/?evlk=AAA')).toBe(
      idDeLink('https://www.instagram.com/reels/Df3T2_HJgC5/?hvrq=BBB'),
    )
  })

  it('dos videos distintos de YouTube dan dos fichas (el id va en ?v=)', () => {
    const a = idDeLink('https://www.youtube.com/watch?v=AAA&si=x')
    expect(a).toBe('watch-AAA')
    expect(a).not.toBe(idDeLink('https://www.youtube.com/watch?v=BBB'))
    expect(idDeLink('https://m.youtube.com/watch?v=AAA')).toBe(a)
  })

  it('un link corto no arrastra el query string, pero respeta mayúsculas del código', () => {
    expect(idDeLink('https://youtu.be/abc?si=token1')).toBe(idDeLink('https://youtu.be/abc?si=token2'))
    expect(idDeLink('https://vt.tiktok.com/ZSpv4bqmC/')).not.toBe(idDeLink('https://vt.tiktok.com/zspv4bqmc/'))
  })

  it('TikTok con /video/ usa el id del video', () => {
    expect(idDeLink('https://www.tiktok.com/@strokesgain/video/7311?lang=es')).toBe('video-7311')
  })
})

describe('validarAnalisis', () => {
  const completo = { formato: 'a', gancho: 'b', adaptacion_golfers: 'c', no_copiar: 'd' }

  it('deja pasar un análisis completo', () => {
    expect(validarAnalisis(completo)).toBe(completo)
  })

  it('corta un análisis al que le falta algo que /rrss lee, en vez de guardar una ficha vacía', () => {
    expect(() => validarAnalisis({ ...completo, gancho: '' })).toThrow(/gancho/)
    expect(() => validarAnalisis({ formato: 'a' })).toThrow(/adaptacion_golfers/)
    expect(() => validarAnalisis(null)).toThrow(/formato/)
  })
})

describe('mimeDeImagen', () => {
  it('rechaza lo que Gemini no recibe como imagen en vez de mandarlo mal etiquetado', () => {
    expect(mimeDeImagen('a/b.JPG')).toBe('image/jpeg')
    expect(mimeDeImagen('a/b.png')).toBe('image/png')
    expect(() => mimeDeImagen('a/b.heic')).toThrow(/no soportado/)
  })
})

describe('motivoDeFalloDescarga', () => {
  it('un post de imagen dice que se revisa a mano, no un error críptico de yt-dlp', () => {
    expect(motivoDeFalloDescarga('ERROR: [Instagram] Dd9oSP-pUW3: No video formats found!; please report')).toMatch(
      /post de imagen/,
    )
  })

  it('otro fallo muestra la línea de ERROR de yt-dlp', () => {
    expect(motivoDeFalloDescarga('[info] algo\nERROR: [Instagram] login required')).toBe(
      'yt-dlp no pudo bajarlo: ERROR: [Instagram] login required',
    )
  })
})

describe('reportesDeReferencia', () => {
  const r = (id: string, status: string, texto: string | null, caption: string | null = null) => ({
    id,
    status,
    texto,
    caption,
  })

  it('toma solo los pendientes con link a una pieza; deja bugs, fotos y los ya tomados', () => {
    const elegidos = reportesDeReferencia([
      r('a', 'nuevo', 'https://www.instagram.com/reel/AAA/'),
      r('b', 'triaged', null, 'https://vt.tiktok.com/BBB/'),
      r('c', 'nuevo', 'El scorer se cae al guardar'),
      r('d', 'resuelto', 'https://www.instagram.com/reel/DDD/'),
      r('e', 'en_progreso', 'https://www.instagram.com/reel/EEE/'),
      r('f', 'triaged', 'Mensaje de Max: PR https://github.com/x/y/pull/1'),
    ])
    expect(elegidos.map((x: { reporte: { id: string } }) => x.reporte.id)).toEqual(['a', 'b'])
  })

  it('un reporte largo que trae un link es un reporte, no una referencia: va al triage', () => {
    const largo = `https://www.youtube.com/watch?v=AAA ${'palabra '.repeat(MAX_PALABRAS_NOTA + 1)}`
    const corto = 'https://www.instagram.com/reel/AAA/ hacer algo así pero más pro y menos IA'
    expect(reportesDeReferencia([r('x', 'nuevo', largo)])).toEqual([])
    expect(reportesDeReferencia([r('y', 'nuevo', corto)])).toHaveLength(1)
  })
})

describe('notas del reporte', () => {
  it('la nota es lo que Juanjo escribió, sin el link', () => {
    const link = 'https://www.instagram.com/reel/AAA/'
    expect(notaDelReporte({ texto: `${link} esto pero más pro`, caption: null }, link)).toBe('esto pero más pro')
    expect(notaDelReporte({ texto: link, caption: null }, link)).toBe('')
  })

  it('agregarNota no pierde el análisis previo ni repite una línea al correr dos veces', () => {
    const cuando = new Date('2026-11-19T12:00:00Z')
    const linea = `${ESPERA_MERGE}reel-AAA`
    const una = agregarNota('29-oct analizado (Gemini)', linea, cuando)
    expect(una).toBe(`29-oct analizado (Gemini)\n2026-11-19: ${linea}`)
    expect(agregarNota(una, linea, cuando)).toBe(una)
    expect(agregarNota(null, linea, cuando)).toBe(`2026-11-19: ${linea}`)
  })

  it('fichaEsperada saca de las notas el id que el reporte espera ver en main', () => {
    expect(fichaEsperada(`algo\n2026-11-19: ${ESPERA_MERGE}vt-tiktok-com-ZSpv4bqmC`)).toBe('vt-tiktok-com-ZSpv4bqmC')
    expect(fichaEsperada('esperando promoción: abc123')).toBeNull()
    expect(fichaEsperada(null)).toBeNull()
  })
})
