import { describe, it, expect, vi } from 'vitest'
import {
  armarLotesPorPeso, avisoDeFotosNoLeidas, mensajeDeFotoNoLeida, subirFotosImportacion, MENSAJES_SUBIDA_FOTOS,
} from './subir-fotos'
import { ERROR_IMPORT_IA_NO_DISPONIBLE } from '@/lib/import-types'
import { JsonInvalidoError } from '@/lib/red/fetch-json-con-plazo'
import { TiempoAgotadoError } from '@/lib/red/con-timeout'
import { LIMITE_CUERPO_SUBIDA_BYTES } from '@/lib/red/limite-cuerpo'

const MB = 1024 * 1024

function foto(nombre: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], nombre, { type: 'image/png' })
}

/** `enviar` falso: responde en orden con los objetos dados y registra cada FormData. */
function enviarFalso(respuestas: Array<{ status: number; json: unknown } | Error>) {
  const cuerpos: FormData[] = []
  const enviar = vi.fn(async (_url: string, init: RequestInit) => {
    cuerpos.push(init.body as FormData)
    const r = respuestas.shift()
    if (!r) throw new Error('sin más respuestas')
    if (r instanceof Error) throw r
    return { res: { ok: r.status >= 200 && r.status < 300, status: r.status } as Response, json: r.json }
  })
  return { enviar, cuerpos }
}

const sinComprimir = async (f: File) => f

describe('armarLotesPorPeso', () => {
  it('todo cabe en un lote', () => {
    expect(armarLotesPorPeso([1, 2, 3], 10)).toEqual({ lotes: [[0, 1, 2]], demasiadoGrande: null })
  })

  it('parte en lotes sin pasar el límite, en orden', () => {
    expect(armarLotesPorPeso([4, 4, 4, 1], 8)).toEqual({ lotes: [[0, 1], [2, 3]], demasiadoGrande: null })
  })

  it('un archivo justo en el límite va solo', () => {
    expect(armarLotesPorPeso([8, 1], 8)).toEqual({ lotes: [[0], [1]], demasiadoGrande: null })
  })

  it('un archivo que solo ya pasa el límite se informa', () => {
    expect(armarLotesPorPeso([1, 9, 1], 8)).toEqual({ lotes: [], demasiadoGrande: 1 })
  })

  it('sin archivos no hay lotes', () => {
    expect(armarLotesPorPeso([], 8)).toEqual({ lotes: [], demasiadoGrande: null })
  })
})

describe('subirFotosImportacion', () => {
  it('2 fotos de 3 MB (el caso que daba "Unexpected token") van en dos requests y se unen', async () => {
    const { enviar, cuerpos } = enviarFalso([
      { status: 200, json: { job_id: 'job-1', rounds: [{ tempId: 'a' }], errors: undefined } },
      { status: 200, json: { job_id: 'job-2', rounds: [{ tempId: 'b' }] } },
    ])
    const r = await subirFotosImportacion([foto('a.png', 3 * MB), foto('b.png', 3 * MB)], {
      comprimir: sinComprimir,
      enviar: enviar as never,
    })
    expect(enviar).toHaveBeenCalledTimes(2)
    for (const fd of cuerpos) {
      const peso = (fd.getAll('images') as File[]).reduce((s, f) => s + f.size, 0)
      expect(peso).toBeLessThanOrEqual(LIMITE_CUERPO_SUBIDA_BYTES)
    }
    expect(r.rounds.map(x => x.tempId)).toEqual(['a', 'b'])
    expect(r.jobId).toBe('job-2')
  })

  it('fotos chicas van en un solo request', async () => {
    const { enviar, cuerpos } = enviarFalso([{ status: 200, json: { job_id: 'j', rounds: [] } }])
    await subirFotosImportacion([foto('a.png', 300_000), foto('b.png', 300_000)], {
      comprimir: sinComprimir,
      enviar: enviar as never,
    })
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(cuerpos[0].getAll('images')).toHaveLength(2)
  })

  it('usa la versión comprimida (un blob se manda como .jpg)', async () => {
    const { enviar, cuerpos } = enviarFalso([{ status: 200, json: { job_id: 'j', rounds: [] } }])
    await subirFotosImportacion([foto('IMG_1.PNG', 6 * MB)], {
      comprimir: async () => new Blob([new Uint8Array(200_000)], { type: 'image/jpeg' }),
      enviar: enviar as never,
    })
    const enviado = cuerpos[0].get('images') as File
    expect(enviado.name).toBe('IMG_1.jpg')
    expect(enviado.type).toBe('image/jpeg')
    expect(enviado.size).toBe(200_000)
  })

  it('si comprimir falla, manda el original', async () => {
    const { enviar, cuerpos } = enviarFalso([{ status: 200, json: { job_id: 'j', rounds: [] } }])
    await subirFotosImportacion([foto('a.png', 1000)], {
      comprimir: async () => { throw new Error('canvas') },
      enviar: enviar as never,
    })
    expect((cuerpos[0].get('images') as File).name).toBe('a.png')
  })

  it('una foto que aún comprimida pasa el límite → mensaje claro, sin request', async () => {
    const { enviar } = enviarFalso([])
    await expect(
      subirFotosImportacion([foto('enorme.heic', 5 * MB)], { comprimir: sinComprimir, enviar: enviar as never }),
    ).rejects.toThrow(MENSAJES_SUBIDA_FOTOS.fotoMuyPesada('enorme.heic'))
    expect(enviar).not.toHaveBeenCalled()
  })

  it('los índices de error del 2º lote se traducen a la foto original', async () => {
    const { enviar } = enviarFalso([
      { status: 200, json: { job_id: 'j1', rounds: [] } },
      { status: 200, json: { job_id: 'j2', rounds: [], errors: [{ index: 0, error: 'not_a_scorecard' }] } },
    ])
    const r = await subirFotosImportacion([foto('a.png', 3 * MB), foto('b.png', 3 * MB)], {
      comprimir: sinComprimir,
      enviar: enviar as never,
    })
    expect(r.errors).toEqual([{ index: 1, error: 'not_a_scorecard' }])
  })

  it('respeta el mensaje de error del servidor (p. ej. 503 sin Gemini)', async () => {
    const { enviar } = enviarFalso([{ status: 503, json: { error: 'El reconocimiento de fotos no está disponible.' } }])
    await expect(
      subirFotosImportacion([foto('a.png', 1000)], { comprimir: sinComprimir, enviar: enviar as never }),
    ).rejects.toThrow('El reconocimiento de fotos no está disponible.')
  })

  it('cuerpo que no es JSON (413/504 de Vercel) → mensaje para el jugador, nunca "Unexpected token"', async () => {
    const { enviar } = enviarFalso([new JsonInvalidoError('Respuesta no es JSON')])
    await expect(
      subirFotosImportacion([foto('a.png', 1000)], { comprimir: sinComprimir, enviar: enviar as never }),
    ).rejects.toThrow(MENSAJES_SUBIDA_FOTOS.respuestaIlegible)
  })

  it('comprime de a una foto, nunca en paralelo (memoria de canvas en iOS)', async () => {
    let enCurso = 0
    let maximo = 0
    const comprimir = async (f: File) => {
      enCurso++
      maximo = Math.max(maximo, enCurso)
      await new Promise(r => setTimeout(r, 5))
      enCurso--
      return f
    }
    const { enviar } = enviarFalso([{ status: 200, json: { job_id: 'j', rounds: [] } }])
    await subirFotosImportacion([foto('a.png', 10), foto('b.png', 10), foto('c.png', 10)], {
      comprimir,
      enviar: enviar as never,
    })
    expect(maximo).toBe(1)
  })

  it('si falla el 2º lote, no sigue con un resultado parcial: muestra el error real', async () => {
    const { enviar } = enviarFalso([
      { status: 200, json: { job_id: 'j1', rounds: [{ tempId: 'a' }] } },
      { status: 429, json: { error: 'Demasiadas importaciones. Intenta de nuevo en una hora.' } },
    ])
    await expect(
      subirFotosImportacion([foto('a.png', 3 * MB), foto('b.png', 3 * MB)], {
        comprimir: sinComprimir,
        enviar: enviar as never,
      }),
    ).rejects.toThrow('Demasiadas importaciones. Intenta de nuevo en una hora.')
  })

  it('plazo vencido → no se le dice que revise la conexión', async () => {
    const { enviar } = enviarFalso([new TiempoAgotadoError(75_000)])
    await expect(
      subirFotosImportacion([foto('a.png', 1000)], { comprimir: sinComprimir, enviar: enviar as never }),
    ).rejects.toThrow(MENSAJES_SUBIDA_FOTOS.plazoVencido)
  })

  it('sin red → mensaje de conexión', async () => {
    const { enviar } = enviarFalso([new TypeError('Failed to fetch')])
    await expect(
      subirFotosImportacion([foto('a.png', 1000)], { comprimir: sinComprimir, enviar: enviar as never }),
    ).rejects.toThrow(MENSAJES_SUBIDA_FOTOS.sinRed)
  })
})

// Regresión (dead-end hunter 17-oct-2026): con 5 fotos y 1 que no era tarjeta, la
// revisión mostraba 4 rondas sin decir nada y el jugador creía haber importado todo.
describe('avisoDeFotosNoLeidas', () => {
  it('sin fotos fallidas no hay aviso', () => {
    expect(avisoDeFotosNoLeidas([], 5)).toBeNull()
  })

  it('una foto que no es tarjeta: dice cuál (numerada desde 1) y de cuántas', () => {
    expect(avisoDeFotosNoLeidas([{ index: 3, error: 'not_a_scorecard' }], 5))
      .toBe('No importamos la foto 4 de 5: no parece una tarjeta de Garmin Golf. Revisa las rondas de abajo y vuelve a subir esa foto después.')
  })

  it('varias fotos, en orden y sin repetir; si alguna falló por otra causa dice "no se pudieron leer"', () => {
    const aviso = avisoDeFotosNoLeidas([
      { index: 4, error: 'not_a_scorecard' },
      { index: 0, error: 'lectura_fallida' },
      { index: 4, error: 'not_a_scorecard' },
    ], 6)
    expect(aviso).toBe('No importamos 2 de tus 6 fotos (las fotos 1 y 5): no se pudieron leer. Revisa las rondas de abajo y vuelve a subir esas fotos después.')
  })
})

describe('mensajeDeFotoNoLeida', () => {
  it('traduce cada código a un mensaje para el jugador', () => {
    expect(mensajeDeFotoNoLeida('not_a_scorecard')).toMatch(/No se detectó una tarjeta de golf/)
    expect(mensajeDeFotoNoLeida(ERROR_IMPORT_IA_NO_DISPONIBLE)).toMatch(/servicio de lectura de fotos/)
    expect(mensajeDeFotoNoLeida(undefined)).toMatch(/No pudimos leer la foto/)
  })
})
