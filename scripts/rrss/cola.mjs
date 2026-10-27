// La cola de publicación: qué tanda de piezas existe, en qué estado está y quién
// la aprobó. Es la única fuente del estado del sistema de RRSS.
//
// Por qué en archivos y no en tablas `rrss_*` como decía el diseño del 26-oct:
// el principio del sistema es "aislado de la app de producción" y una tabla en el
// proyecto de Supabase de prod lo contradice de entrada —una migración más que
// aprobar, una ruta API más dentro del deploy que corre los torneos, un secreto
// más en Vercel—. Acá el estado son archivos versionados en el repo: la historia
// de cada decisión queda en el log de git gratis, no hay nada que pueda tocar un
// torneo y el sistema se puede probar completo sin credenciales. Cuando F3 pida
// series de métricas (muchas filas, consultas por fecha) se agrega la tabla ahí,
// con datos reales a la vista para diseñarla.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

/**
 * Donde viven las tandas. `RRSS_DIR_TANDAS` existe para que los tests escriban en
 * una carpeta temporal: sin eso, probar la máquina de estados de verdad —leyendo
 * y escribiendo, que es como se usa— dejaría tandas de prueba en el repo, y un
 * test que no toca disco no prueba el camino que importa.
 */
export function dirTandas(env = process.env) {
  return env.RRSS_DIR_TANDAS?.trim() || path.join(AQUI, 'tandas')
}

/**
 * Forma del slug de una tanda. Igual que `SLUG_PIEZA` en marca.mjs, no es
 * cosmética: el slug entra en una ruta de disco (`out/rrss/tandas/<slug>/`) y el
 * empaquetador borra esa carpeta antes de escribir. Sin barras, sin puntos y sin
 * "..", el borrado no puede salirse de donde corresponde.
 */
export const SLUG_TANDA = /^\d{4}-W\d{2}$/

/**
 * Los estados de una tanda. El orden importa: una pieza NO se empaqueta para
 * publicar si la tanda no pasó por `aprobada`, y eso se afirma en publicar.mjs
 * leyendo este módulo, no repitiendo la lista.
 */
export const ESTADOS = [
  'borrador', // Claude armó la tanda; todavía no se renderizó ni se mandó
  'en_revision', // está en manos de Juanjo, esperando veredicto
  'cambios_pedidos', // Juanjo pidió cambios con una nota; vuelve a borrador al regenerar
  'aprobada', // listo para publicar
  'publicada', // ya salió; guarda el id de cada publicación para medirla después
  'rechazada', // no sale nunca; queda en el repo para no volver a proponerla
]

/**
 * Qué transición es legal desde cada estado.
 *
 * Esto es el guardarraíl del sistema, no burocracia: lo único que no puede pasar
 * nunca es que algo se publique sin que Juanjo lo haya aprobado. Un `estado` que
 * se escribe a mano desde cualquier script no da esa garantía; una función que
 * valida la transición, sí. `publicada` y `rechazada` son terminales a propósito.
 */
export const TRANSICIONES = {
  borrador: ['en_revision', 'rechazada'],
  en_revision: ['aprobada', 'cambios_pedidos', 'rechazada'],
  cambios_pedidos: ['borrador', 'rechazada'],
  aprobada: ['publicada', 'cambios_pedidos', 'rechazada'],
  publicada: [],
  rechazada: [],
}

/** Los roles que una pieza puede cumplir dentro de la tanda (plan v2, sección 6). */
export const ROLES = ['central', 'derivado', 'story']

export function rutaTanda(slug) {
  if (!SLUG_TANDA.test(slug ?? ''))
    throw new Error(`Slug de tanda inválido: "${slug}". Forma: 2026-W44 (año y semana ISO).`)
  return path.join(dirTandas(), `${slug}.json`)
}

/**
 * La semana ISO de una fecha, que es como se nombran las tandas: una por semana
 * (ritmo decidido el 26-oct). Se calcula acá y no con una librería porque es la
 * clave primaria del sistema y una dependencia menos es una menos que romperse.
 */
export function semanaISO(fecha = new Date()) {
  // Jueves de la misma semana: la semana ISO 1 es la que contiene el primer
  // jueves del año, así que el año del jueves es el año ISO de toda la semana.
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()))
  const diaISO = d.getUTCDay() || 7 // domingo = 7, no 0
  d.setUTCDate(d.getUTCDate() + 4 - diaISO)
  const anio = d.getUTCFullYear()
  const enero1 = Date.UTC(anio, 0, 1)
  const semana = Math.ceil(((d.getTime() - enero1) / 86400000 + 1) / 7)
  return `${anio}-W${String(semana).padStart(2, '0')}`
}

export function leerTanda(slug) {
  const ruta = rutaTanda(slug)
  if (!existsSync(ruta)) return null
  return JSON.parse(readFileSync(ruta, 'utf8'))
}

export function escribirTanda(tanda) {
  const ruta = rutaTanda(tanda.slug)
  mkdirSync(dirTandas(), { recursive: true })
  writeFileSync(ruta, `${JSON.stringify(tanda, null, 2)}\n`)
  return ruta
}

export function listarTandas() {
  const dir = dirTandas()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => (a.slug < b.slug ? 1 : -1)) // la más nueva primero
}

/**
 * Arma una tanda nueva en estado `borrador`.
 *
 * `piezas` son referencias a los JSON de `scripts/rrss/piezas/`, no copias: si el
 * caption de una pieza cambia, la tanda no queda con el viejo. Guardar el texto
 * acá era la forma de que la tanda y la pieza se desincronizaran en silencio.
 */
export function crearTanda({ slug = semanaISO(), idea, piezas, cuando = new Date() }) {
  if (!idea?.trim()) throw new Error('La tanda necesita una idea central: es lo que se aprueba o se rechaza.')
  if (!piezas?.length) throw new Error('Una tanda sin piezas no se puede aprobar.')
  for (const p of piezas) {
    if (!p.pieza?.trim()) throw new Error('Cada entrada de la tanda necesita el slug de su pieza.')
    if (!ROLES.includes(p.rol)) throw new Error(`Rol "${p.rol}" desconocido. Hay: ${ROLES.join(', ')}.`)
  }
  if (!piezas.some((p) => p.rol === 'central'))
    throw new Error('La tanda necesita una pieza central: el ritmo es "pieza central + derivados".')
  const iso = cuando.toISOString()
  return {
    slug,
    idea: idea.trim(),
    estado: 'borrador',
    piezas,
    historial: [{ estado: 'borrador', cuando: iso, nota: 'tanda creada' }],
  }
}

/**
 * Mueve una tanda de estado, dejando constancia. Devuelve la tanda nueva; no
 * muta la que recibe, para que quien la llame no se quede con dos versiones
 * distintas del mismo objeto en memoria.
 */
export function transicionar(tanda, nuevo, { nota = '', cuando = new Date(), ...extra } = {}) {
  if (!ESTADOS.includes(nuevo)) throw new Error(`Estado "${nuevo}" desconocido. Hay: ${ESTADOS.join(', ')}.`)
  const legales = TRANSICIONES[tanda.estado] ?? []
  if (!legales.includes(nuevo))
    throw new Error(
      `La tanda ${tanda.slug} está en "${tanda.estado}" y no puede pasar a "${nuevo}". ` +
        (legales.length ? `Desde acá solo: ${legales.join(', ')}.` : 'Es un estado terminal.'),
    )
  if (nuevo === 'cambios_pedidos' && !nota.trim())
    throw new Error('"cambios_pedidos" sin nota no sirve: nadie sabe qué cambiar.')
  return {
    ...tanda,
    ...extra,
    estado: nuevo,
    historial: [...tanda.historial, { estado: nuevo, cuando: cuando.toISOString(), nota }],
  }
}

/** Las tandas esperando veredicto de Juanjo. Es lo que mira `/rrss` al arrancar. */
export function pendientesDeAprobacion() {
  return listarTandas().filter((t) => t.estado === 'en_revision')
}

/** La tanda viva de la semana, si hay: la que todavía no se publicó ni se rechazó. */
export function tandaAbierta(slug = semanaISO()) {
  const t = leerTanda(slug)
  if (!t) return null
  return ['publicada', 'rechazada'].includes(t.estado) ? null : t
}
