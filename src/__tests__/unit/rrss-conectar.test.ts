import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  chatsDeLasActualizaciones,
  elegirChat,
  guardarEnEnv,
  rutaTemporalDeEnv,
  siguienteOffset,
} from '../../../scripts/rrss/conectar-telegram.mjs'

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

  it('deja una sola linea cuando la clave ya estaba repetida', () => {
    // Dos lineas con la misma clave es un estado que existe (se pega dos veces y
    // nadie lo nota) y en un .env gana la ULTIMA. Actualizar solo la primera deja
    // el archivo diciendo una cosa y el proceso leyendo otra: el canal apuntando a
    // un chat viejo mientras .env.local muestra el nuevo tres lineas mas arriba.
    const ruta = envDePrueba('A=1\nRRSS_TELEGRAM_CHAT_ID=uno\nB=2\nRRSS_TELEGRAM_CHAT_ID=dos\nC=3\n')
    expect(guardarEnEnv('RRSS_TELEGRAM_CHAT_ID', 'nuevo', ruta)).toBe('actualizada')
    expect(readFileSync(ruta, 'utf8')).toBe('A=1\nRRSS_TELEGRAM_CHAT_ID=nuevo\nB=2\nC=3\n')
  })

  it('no deja un archivo a medio escribir al lado', () => {
    // Se escribe en un .tmp y se renombra: `writeFileSync` sobre el archivo lo
    // trunca al abrirlo, y si el proceso muere en ese instante .env.local queda
    // vacio. Pasa de verdad: en la sesion que escribio esto, un script que abrio
    // 'wb' y fallo despues dejo marca.mjs en cero bytes.
    const ruta = envDePrueba(VIVO)
    guardarEnEnv('RRSS_TELEGRAM_CHAT_ID', '42', ruta)
    // Nada quedo al lado: ni el nombre viejo ni ningun otro.
    expect(existsSync(`${ruta}.tmp`)).toBe(false)
    expect(readdirSync(dir)).toEqual(['.env.local'])
    expect(readFileSync(ruta, 'utf8')).toContain('SUPABASE_SERVICE_ROLE_KEY=clave-de-servicio')
  })

  it('el temporal se llama como algo que .gitignore ya tapa', () => {
    // Es el punto entero: ese archivo es una copia COMPLETA de .env.local y el repo
    // es PUBLICO. `.env.local.tmp` —como se llamaba— no lo cubre ninguna regla
    // (`.env*.local` no calza con un .tmp al final), asi que un rename que falla
    // (Windows con OneDrive sincronizando) o un Ctrl+C dejaban las credenciales en
    // el arbol, listas para que el `git add .` siguiente las subiera a GitHub.
    const destino = path.join('un', 'lado', '.env.local')
    const tmp = rutaTemporalDeEnv(destino)
    expect(path.basename(tmp).startsWith('.env')).toBe(true)
    expect(path.basename(tmp).endsWith('.local')).toBe(true)
    // Y al lado del archivo que reemplaza, no en otro directorio.
    expect(path.dirname(tmp)).toBe(path.dirname(destino))
  })
})

describe('de que chat sale el veredicto', () => {
  const mensaje = (id: number, extra: Record<string, unknown> = {}, update_id = id) => ({
    update_id,
    message: { chat: { id, type: 'private', first_name: 'Juan Jose', last_name: 'Lamarca', ...extra } },
  })

  it('no elige cuando escribieron dos chats distintos: devuelve los dos', () => {
    // El bot esta nombrado en un repo PUBLICO y cualquiera puede apretar Iniciar.
    // Quedarse con "el ultimo que escribio" le manda a un desconocido el reel, el
    // caption sin publicar y los tres botones de aprobacion, y deja a Juanjo sin
    // canal. Con dos candidatos el comando pide --chat en vez de adivinar.
    const chats = chatsDeLasActualizaciones([mensaje(111), mensaje(222)])
    expect(chats.map((c) => c.id)).toEqual(['222', '111'])
  })

  it('junta los mensajes de un mismo chat en una sola opcion', () => {
    // Tres mensajes de Juanjo no son tres candidatos: si contaran como varios, el
    // camino normal (escribir /start y mandar un hola) pediria --chat sin motivo.
    const chats = chatsDeLasActualizaciones([mensaje(111, {}, 1), mensaje(111, {}, 2), mensaje(111, {}, 3)])
    expect(chats).toHaveLength(1)
    expect(chats[0].id).toBe('111')
  })

  it('devuelve el id como string, porque asi se compara despues', () => {
    // `esDelChatAprobador` compara contra RRSS_TELEGRAM_CHAT_ID, que sale del env
    // y siempre es string: devolver un number hace que 123 !== '123' y el canal
    // ignora en silencio todos los veredictos.
    const [chat] = chatsDeLasActualizaciones([mensaje(123)])
    expect(chat.id).toBe('123')
    expect(typeof chat.id).toBe('string')
  })

  it('tambien encuentra el chat cuando lo unico que hay es un toque de boton', () => {
    const chats = chatsDeLasActualizaciones([
      { callback_query: { message: { chat: { id: 777, type: 'group', title: 'Golfers+ RRSS' } } } },
    ])
    expect(chats[0]).toMatchObject({ id: '777', tipo: 'group', titulo: 'Golfers+ RRSS' })
  })

  it('arma el nombre de una persona y no se cae si falta el apellido', () => {
    // El nombre es lo unico con lo que Juanjo puede darse cuenta de que el chat
    // guardado no es el suyo: si sale vacio, el aviso no avisa nada.
    expect(chatsDeLasActualizaciones([mensaje(1)])[0].titulo).toBe('Juan Jose Lamarca')
    expect(chatsDeLasActualizaciones([mensaje(1, { last_name: undefined })])[0].titulo).toBe('Juan Jose')
  })

  it('devuelve la lista vacia cuando no llego nada, en vez de inventar un chat', () => {
    expect(chatsDeLasActualizaciones([])).toEqual([])
    expect(chatsDeLasActualizaciones([{ edited_message: {} }])).toEqual([])
  })
})

/**
 * La regla vivia dentro de main() y no la tocaba ningun test: es la que decide a QUE
 * telefono se le manda el reel sin publicar, el caption y los tres botones de
 * aprobacion. Equivocarse aca no da error, da un desconocido aprobando tandas.
 */
describe('elegir el chat que aprueba', () => {
  const chat = (id: string, titulo = `chat ${id}`) => ({ id, titulo, tipo: 'private', usuario: null })

  it('con un solo chat, ese es', () => {
    expect(elegirChat([chat('111')])).toEqual({ chat: chat('111'), motivo: null })
  })

  it('con dos chats no adivina: pide --chat', () => {
    // "El ultimo que escribio" es exactamente el camino por el que un desconocido
    // que apreto Iniciar se queda con el canal.
    const { chat: elegido, motivo } = elegirChat([chat('111'), chat('222')])
    expect(elegido).toBeNull()
    expect(motivo).toBe('varios')
  })

  it('con --chat se queda con ese, aunque hayan escrito varios', () => {
    expect(elegirChat([chat('111'), chat('222')], '222').chat?.id).toBe('222')
  })

  it('con --chat de alguien que no escribio en esta ventana, no guarda nada', () => {
    // Guardar un id que no mando nada deja el canal muerto y el error aparece
    // recien cuando la primera tanda no llega a ninguna parte.
    const { chat: elegido, motivo } = elegirChat([chat('111')], '999')
    expect(elegido).toBeNull()
    expect(motivo).toBe('no-escribio')
  })

  it('--chat tolera el id con espacios y como numero, que es como se pega', () => {
    expect(elegirChat([chat('111')], ' 111 ').chat?.id).toBe('111')
    expect(elegirChat([chat('111')], 111).chat?.id).toBe('111')
  })

  it('sin mensajes no inventa un chat', () => {
    const { chat: elegido, motivo } = elegirChat([])
    expect(elegido).toBeNull()
    expect(motivo).toBe('sin-mensajes')
  })

  it('un --chat vacio es como no pasarlo', () => {
    // `--chat` sin valor deja un string vacio: tomarlo como filtro dejaria el
    // comando sin camino posible, con un chat valido en la mano.
    expect(elegirChat([chat('111')], '').chat?.id).toBe('111')
    expect(elegirChat([chat('111'), chat('222')], '  ').motivo).toBe('varios')
  })
})

describe('descartar lo que ya estaba en la cola', () => {
  it('el offset es el mayor update_id mas uno', () => {
    // Sin confirmar el offset, getUpdates sigue devolviendo las updates viejas: el
    // /start que un desconocido mando la semana pasada vuelve en cada vuelta y es
    // indistinguible de un mensaje de ahora.
    expect(siguienteOffset([{ update_id: 7 }, { update_id: 9 }])).toBe(10)
    expect(siguienteOffset([{ update_id: 12 }, { update_id: 4 }])).toBe(13)
  })

  it('no inventa un offset cuando no hay nada que confirmar', () => {
    // Tiene que ser null y no 0: `{ offset: 0 }` no significa "sin offset", vuelve
    // a entregar la cola completa, que es justo lo que se esta descartando.
    expect(siguienteOffset([])).toBeNull()
    expect(siguienteOffset([{ mensaje: 'sin update_id' }])).toBeNull()
  })
})
