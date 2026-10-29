import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { chatDeLasActualizaciones, guardarEnEnv } from '../../../scripts/rrss/conectar-telegram.mjs'

/**
 * `guardarEnEnv` escribe en `.env.local`, que es donde viven las credenciales de
 * Supabase, de Vercel y de todo lo demas. Perder una linea de ese archivo deja el
 * proyecto sin arrancar y el error aparece mucho despues, en otro comando. Por eso
 * cada caso de aca compara el archivo ENTERO, no solo la clave que se agrego.
 */
describe('guardar una clave en .env.local sin romper el archivo', () => {
  let dir: string

  afterEach(() => {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  function envDePrueba(contenido: string) {
    dir = mkdtempSync(path.join(tmpdir(), 'rrss-env-'))
    const ruta = path.join(dir, '.env.local')
    writeFileSync(ruta, contenido)
    return ruta
  }

  const VIVO = [
    'NEXT_PUBLIC_SUPABASE_URL=https://ejemplo.supabase.co',
    'SUPABASE_SERVICE_ROLE_KEY=clave-de-servicio',
    '# un comentario',
    'RRSS_TELEGRAM_BOT_TOKEN=123:abc',
    '',
  ].join('\n')

  it('agrega la clave nueva y deja intacto todo lo que ya estaba', () => {
    const ruta = envDePrueba(VIVO)
    expect(guardarEnEnv('RRSS_TELEGRAM_CHAT_ID', '55512345', ruta)).toBe('agregada')
    const despues = readFileSync(ruta, 'utf8')
    expect(despues.startsWith(VIVO)).toBe(true)
    expect(despues).toContain('RRSS_TELEGRAM_CHAT_ID=55512345')
    // Ninguna clave se perdio por el camino.
    const claves = (t: string) => t.split(/\r?\n/).filter((l) => /^[A-Z]/.test(l)).map((l) => l.split('=')[0])
    expect(claves(despues)).toEqual([...claves(VIVO), 'RRSS_TELEGRAM_CHAT_ID'])
  })

  it('actualiza la que ya existe en vez de dejar dos lineas con la misma clave', () => {
    // Dos lineas iguales no dan error: gana una de las dos segun quien lea el
    // archivo, y el canal queda apuntando a un chat que no es.
    const ruta = envDePrueba(`${VIVO}RRSS_TELEGRAM_CHAT_ID=viejo\nOTRA=1\n`)
    expect(guardarEnEnv('RRSS_TELEGRAM_CHAT_ID', 'nuevo', ruta)).toBe('actualizada')
    const despues = readFileSync(ruta, 'utf8')
    expect(despues.match(/^RRSS_TELEGRAM_CHAT_ID=/gm)).toHaveLength(1)
    expect(despues).toContain('RRSS_TELEGRAM_CHAT_ID=nuevo')
    // Y no se la lleva por delante a la linea siguiente.
    expect(despues).toContain('OTRA=1')
  })

  it('no pega la linea nueva al final de la anterior si falta el salto', () => {
    const ruta = envDePrueba('ULTIMA=sin-salto-final')
    guardarEnEnv('RRSS_TELEGRAM_CHAT_ID', '42', ruta)
    expect(readFileSync(ruta, 'utf8')).toBe('ULTIMA=sin-salto-final\nRRSS_TELEGRAM_CHAT_ID=42\n')
  })

  it('no confunde una clave comentada ni una que la tiene de prefijo', () => {
    const ruta = envDePrueba('# RRSS_TELEGRAM_CHAT_ID=comentada\nRRSS_TELEGRAM_CHAT_ID_VIEJO=9\n')
    expect(guardarEnEnv('RRSS_TELEGRAM_CHAT_ID', '42', ruta)).toBe('agregada')
    const despues = readFileSync(ruta, 'utf8')
    expect(despues).toContain('# RRSS_TELEGRAM_CHAT_ID=comentada')
    expect(despues).toContain('RRSS_TELEGRAM_CHAT_ID_VIEJO=9')
    expect(despues).toContain('RRSS_TELEGRAM_CHAT_ID=42')
  })

  it('crea el archivo si no existe', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'rrss-env-'))
    const ruta = path.join(dir, '.env.local')
    expect(guardarEnEnv('RRSS_TELEGRAM_CHAT_ID', '42', ruta)).toBe('agregada')
    expect(readFileSync(ruta, 'utf8')).toBe('RRSS_TELEGRAM_CHAT_ID=42\n')
  })
})

describe('de que chat sale el veredicto', () => {
  const mensaje = (id: number, extra: Record<string, unknown> = {}) => ({
    message: { chat: { id, type: 'private', first_name: 'Juan Jose', last_name: 'Lamarca', ...extra } },
  })

  it('se queda con el ultimo chat que escribio, no con el primero', () => {
    // Si alguien le escribe al bot antes que Juanjo, el primer update es de un
    // desconocido: tomar el primero deja el canal de aprobacion en manos de otro.
    const chat = chatDeLasActualizaciones([mensaje(111), mensaje(222)])
    expect(chat?.id).toBe('222')
  })

  it('devuelve el id como string, porque asi se compara despues', () => {
    // `esDelChatAprobador` compara contra RRSS_TELEGRAM_CHAT_ID, que sale del env
    // y siempre es string: devolver un number hace que 123 !== '123' y el canal
    // ignora en silencio todos los veredictos.
    const chat = chatDeLasActualizaciones([mensaje(123)])
    expect(chat?.id).toBe('123')
    expect(typeof chat?.id).toBe('string')
  })

  it('tambien encuentra el chat cuando lo unico que hay es un toque de boton', () => {
    const chat = chatDeLasActualizaciones([{ callback_query: { message: { chat: { id: 777, type: 'group', title: 'Golfers+ RRSS' } } } }])
    expect(chat).toMatchObject({ id: '777', tipo: 'group', titulo: 'Golfers+ RRSS' })
  })

  it('arma el nombre de una persona y no se cae si falta el apellido', () => {
    expect(chatDeLasActualizaciones([mensaje(1)])?.titulo).toBe('Juan Jose Lamarca')
    expect(chatDeLasActualizaciones([mensaje(1, { last_name: undefined })])?.titulo).toBe('Juan Jose')
  })

  it('devuelve null cuando no llego nada, en vez de inventar un chat', () => {
    expect(chatDeLasActualizaciones([])).toBeNull()
    expect(chatDeLasActualizaciones([{ edited_message: {} }])).toBeNull()
  })
})
