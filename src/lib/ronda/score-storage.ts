// src/lib/ronda/score-storage.ts
//
// Wrapper tipado de localStorage para scores de ronda libre.
// Extraído de src/app/ronda-libre/[codigo]/score/page.tsx (T3 Sprint 1).
// Sprint 2: esta capa se reemplazará por una cola IndexedDB offline-first.
//
// Parity byte-a-byte con los originales lsKey/lsSave/lsLoad/lsClear:
// - key: `ronda_${codigo}_${jugadorId}`
// - save/clear envueltos en try/catch silencioso (quota exceeded / disabled)
// - load devuelve {} si no hay nada o si el JSON está corrupto

import { borrarClavesConPrefijo } from '@/lib/local-storage-prefijo'
import {
  borrarRespaldosDeRonda,
  DIAS_RETENCION_RECHAZADO_EN_FIRME,
  estadoDelPlazo,
  marcarRespaldosDeRondaCerrada,
  relojPlausible,
} from '@/lib/ronda/respaldo-local'

const KEY = (codigo: string, jugadorId: string) => `ronda_${codigo}_${jugadorId}`

export function saveScores(codigo: string, jugadorId: string, scores: Record<number, number>): void {
  try {
    localStorage.setItem(KEY(codigo, jugadorId), JSON.stringify(scores))
  } catch {
    // storage quota exceeded or disabled — silently drop (parity con lsSave original)
  }
}

export function loadScores(codigo: string, jugadorId: string): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY(codigo, jugadorId)) ?? '{}')
  } catch {
    return {}
  }
}

export function clearScores(codigo: string, jugadorId: string): void {
  try {
    localStorage.removeItem(KEY(codigo, jugadorId))
  } catch {
    // noop (parity con lsClear original)
  }
}

/**
 * Borra las tarjetas de TODOS los jugadores de una ronda en este teléfono (la ronda ya no existe o
 * se descartó). El `_` final del prefijo no toca otra ronda cuyo código empiece igual; las claves
 * del scorer de grupo (`ronda_grupo_…`, `ronda_puntitos_…`) no calzan porque el código va en
 * mayúsculas.
 */
export function clearScoresDeRonda(codigo: string): void {
  borrarClavesConPrefijo(KEY(codigo, ''))
}

// Exportado para la migración a IndexedDB (Sprint 2) y para tests.
export const SCORE_STORAGE_KEY = KEY

// ─── Scorer de grupo / admin ───────────────────────────────────────────────
// El scorer de grupo respalda TODAS las tarjetas de la ronda en una sola
// entrada (`ronda_grupo_<codigo>`), distinta de la del scorer individual
// (`ronda_<codigo>_<jugador>`). Mismos try/catch silenciosos.

const GROUP_KEY = (codigo: string) => `ronda_grupo_${codigo}`

export function saveGroupScores(codigo: string, scores: Record<string, Record<number, number>>): void {
  try {
    localStorage.setItem(GROUP_KEY(codigo), JSON.stringify(scores))
  } catch {
    // quota / storage deshabilitado — silencioso, paridad con el original
  }
}

export function loadGroupScores(codigo: string): Record<string, Record<number, number>> {
  try {
    return JSON.parse(localStorage.getItem(GROUP_KEY(codigo)) ?? '{}')
  } catch {
    return {}
  }
}

export const GROUP_SCORE_STORAGE_KEY = GROUP_KEY

// ─── Copia local del scorer de grupo (abrir sin servidor) ──────────────────
// Caída del 04-oct-2026: con la API caída el scorer no podía ni abrir (ni
// recargarse) y el marcador quedó fuera de su ronda. Cada carga exitosa deja
// acá todo lo que el scorer necesita para pintar y anotar; si el servidor no
// responde, abre desde esta copia y sincroniza los golpes cuando vuelva.
// Los golpes NO viven acá (siguen en `ronda_grupo_<codigo>`).

const SNAPSHOT_PREFIX = 'scorer_grupo_snapshot_'
const SNAPSHOT_KEY = (codigo: string) => `${SNAPSHOT_PREFIX}${codigo}`
const SNAPSHOT_VERSION = 1
/** Una copia más vieja que esto no abre el scorer (una ronda dura < 6 h; margen amplio). */
export const SNAPSHOT_TTL_MS = 24 * 3_600_000

export interface ScorerGrupoSnapshot<R = unknown, H = unknown, E = unknown> {
  v: typeof SNAPSHOT_VERSION
  /** epoch ms de la carga que lo generó */
  at: number
  /** usuario que lo cargó: sólo él puede abrir desde la copia */
  authUserId: string
  anotadorNombre: string
  ronda: R
  parMap: Record<number, number>
  holeDataMap: Record<number, H>
  playerHcp: Record<string, number>
  playerDisplayHcp: Record<string, number>
  teamEquipos: E[]
}

export function saveScorerGrupoSnapshot(codigo: string, snap: Omit<ScorerGrupoSnapshot, 'v'>): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY(codigo), JSON.stringify({ ...snap, v: SNAPSHOT_VERSION }))
  } catch {
    // quota / storage deshabilitado — sin copia, el scorer igual funciona online
  }
}

/** La copia de ESTE usuario, o null (no hay, corrupta, de otra versión o de otro usuario). */
export function loadScorerGrupoSnapshot(codigo: string, authUserId: string | null): ScorerGrupoSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY(codigo))
    if (!raw) return null
    const s = JSON.parse(raw) as ScorerGrupoSnapshot
    if (s?.v !== SNAPSHOT_VERSION || !s.ronda || !s.authUserId || !Array.isArray(s.teamEquipos)) return null
    if (authUserId && s.authUserId !== authUserId) return null
    if (!(Date.now() - s.at < SNAPSHOT_TTL_MS)) return null
    return s
  } catch {
    return null
  }
}

export function clearScorerGrupoSnapshot(codigo: string): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY(codigo))
  } catch {
    // noop
  }
}

/** Al cerrar sesión: ninguna copia del scorer queda para el próximo usuario del teléfono. */
export function clearAllScorerGrupoSnapshots(): void {
  borrarClavesConPrefijo(SNAPSHOT_PREFIX)
}

// ─── Golpes de equipo del scorer de grupo (scramble / foursome) ───────────
const TEAM_KEY = (codigo: string) => `ronda_grupo_equipos_${codigo}`

export function saveGroupTeamScores(codigo: string, porEquipo: Record<string, Record<string, number>>): void {
  try {
    localStorage.setItem(TEAM_KEY(codigo), JSON.stringify(porEquipo))
  } catch {
    // quota / storage deshabilitado
  }
}

export function loadGroupTeamScores(codigo: string): Record<string, Record<string, number>> {
  try {
    return JSON.parse(localStorage.getItem(TEAM_KEY(codigo)) ?? '{}')
  } catch {
    return {}
  }
}

// ─── Golpes PENDIENTES de confirmar por el servidor ────────────────────────
// Revisión Fable del fix de la caída 04-oct: cada golpe anotado queda acá hasta
// que el servidor confirma ESE valor. Al recargar, lo pendiente gana siempre sobre
// la BD (una corrección hecha sin señal no se pierde) y la sincronización sabe
// exactamente qué falta enviar. Clave: jugadorId, o `eq:<equipoId>` para equipos.

const PEND_KEY = (codigo: string) => `ronda_grupo_pendientes_${codigo}`
export type PendientesGrupo = Record<string, Record<string, number>>
export const ID_PENDIENTE_EQUIPO = (equipoId: string) => `eq:${equipoId}`

/**
 * Cola de pendientes en localStorage: `{ [id]: { [hoyo]: valor } }`, último valor gana, y el servidor confirma
 * un valor EXACTO. La usan los golpes del scorer de grupo y las marcas de puntos especiales de Timba libre
 * (`puntitos-pendientes.ts`), cada una con su propia clave.
 */
export interface ColaDePendientes {
  leer(codigo: string): PendientesGrupo
  /** Marca valores como pendientes (último valor gana). */
  marcar(codigo: string, id: string, valores: Record<string | number, number>): void
  /** Quita los hoyos cuyo pendiente es EXACTAMENTE el valor enviado; si cambió mientras viajaba, sigue pendiente. */
  confirmar(codigo: string, id: string, enviados: Record<string | number, number>): void
  /** Reemplaza la cola entera (para descartar pendientes que otro reemplazó). */
  escribir(codigo: string, p: PendientesGrupo): void
  hay(codigo: string): boolean
  clave(codigo: string): string
}

export function crearColaDePendientes(clave: (codigo: string) => string): ColaDePendientes {
  const leer = (codigo: string): PendientesGrupo => {
    try {
      return JSON.parse(localStorage.getItem(clave(codigo)) ?? '{}')
    } catch {
      return {}
    }
  }
  const escribir = (codigo: string, p: PendientesGrupo): void => {
    try {
      const limpio = Object.fromEntries(Object.entries(p).filter(([, h]) => Object.keys(h).length > 0))
      if (Object.keys(limpio).length === 0) localStorage.removeItem(clave(codigo))
      else localStorage.setItem(clave(codigo), JSON.stringify(limpio))
    } catch {
      // noop
    }
  }
  return {
    leer,
    escribir,
    clave,
    marcar(codigo, id, valores) {
      const p = leer(codigo)
      const actual = { ...(p[id] ?? {}) }
      for (const [h, v] of Object.entries(valores)) if (v != null) actual[String(h)] = v
      p[id] = actual
      escribir(codigo, p)
    },
    confirmar(codigo, id, enviados) {
      const p = leer(codigo)
      const actual = { ...(p[id] ?? {}) }
      for (const [h, v] of Object.entries(enviados)) if (actual[String(h)] === v) delete actual[String(h)]
      p[id] = actual
      escribir(codigo, p)
    },
    hay(codigo) {
      return Object.keys(leer(codigo)).length > 0
    },
  }
}

const golpesPendientes = crearColaDePendientes(PEND_KEY)

export function leerPendientes(codigo: string): PendientesGrupo {
  return golpesPendientes.leer(codigo)
}

/** Marca golpes como pendientes (último valor gana). */
export function marcarPendientes(codigo: string, id: string, golpes: Record<string | number, number>): void {
  golpesPendientes.marcar(codigo, id, golpes)
}

/**
 * El servidor confirmó `enviados`: se quitan los hoyos cuyo pendiente es EXACTAMENTE ese
 * valor. Si el marcador lo cambió mientras viajaba, sigue pendiente.
 */
export function confirmarPendientes(codigo: string, id: string, enviados: Record<string | number, number>): void {
  golpesPendientes.confirmar(codigo, id, enviados)
}

export function hayPendientes(codigo: string): boolean {
  return golpesPendientes.hay(codigo)
}

const PREFIJO_RECH = 'ronda_grupo_rechazados_'
const RECH_KEY = (codigo: string) => `${PREFIJO_RECH}${codigo}`
/** Cuándo se apartó el último rechazo de la ronda (para barrer lo que quedó si nunca se finalizó). */
const PREFIJO_RECH_EN = 'ronda_grupo_rechazo_en_'
const RECH_EN_KEY = (codigo: string) => `${PREFIJO_RECH_EN}${codigo}`
const golpesRechazados = crearColaDePendientes(RECH_KEY)

function borrarRechazados(codigo: string): void {
  try {
    localStorage.removeItem(RECH_KEY(codigo))
    localStorage.removeItem(RECH_EN_KEY(codigo))
  } catch {
    // noop
  }
}

/**
 * Barre los golpes apartados (ver `apartarRechazados`) cuyo último rechazo fue hace más de
 * `DIAS_RETENCION_RECHAZADO_EN_FIRME` días, con la misma regla que la tarjeta rechazada del scorer individual
 * (`estadoDelPlazo`): una marca sin fecha o con una fecha que no sirve empieza a contar desde este barrido, y con
 * el reloj implausible no se barre nada. Sólo mira el teléfono: no toca pendientes ni la copia del grupo.
 */
export function barrerRechazadosViejos(ahora = Date.now()): void {
  if (!relojPlausible(ahora)) return
  const codigos = new Set<string>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIJO_RECH)) codigos.add(k.slice(PREFIJO_RECH.length))
      else if (k?.startsWith(PREFIJO_RECH_EN)) codigos.add(k.slice(PREFIJO_RECH_EN.length))
    }
    for (const codigo of codigos) {
      if (localStorage.getItem(RECH_KEY(codigo)) == null) { localStorage.removeItem(RECH_EN_KEY(codigo)); continue }
      const marca = localStorage.getItem(RECH_EN_KEY(codigo))
      const estado = estadoDelPlazo(marca == null ? null : Number(marca), ahora, DIAS_RETENCION_RECHAZADO_EN_FIRME)
      if (estado === 'reiniciar') localStorage.setItem(RECH_EN_KEY(codigo), String(ahora))
      else if (estado === 'vencido') borrarRechazados(codigo)
    }
  } catch {
    // modo privado / cuota: el próximo barrido reintenta
  }
}

/**
 * El servidor rechazó en firme una tarjeta (P0004/22023: golpe o hoyo inválido; P0001 con la ronda viva: el
 * jugador ya no está). Sus golpes salen de pendientes (reenviarlos solos daría el mismo rechazo cada 15 s y
 * el aviso "sin enviar" quedaría pegado) pero NO se pierden: quedan apartados en el teléfono, se pintan al
 * abrir el scorer y Finalizar los reenvía (`saveAllScores` con `reintentarRechazados`). Se borran con la
 * copia del grupo (ronda borrada o finalizada desde acá: al finalizar sólo pueden quedar los de alguien que
 * ya no está en la ronda, y nadie los vuelve a leer) y, si nunca se finaliza, con `barrerRechazadosViejos`.
 *
 * Sólo se aparta el valor exacto que se envió: si el marcador corrigió el hoyo mientras el envío viajaba, el
 * valor pendiente es más nuevo y no se toca (ni queda el viejo apartado, que lo pisaría al reintentar).
 */
export function apartarRechazados(codigo: string, id: string, golpes: Record<string | number, number>): void {
  const pendiente = golpesPendientes.leer(codigo)[id] ?? {}
  const apartados = Object.fromEntries(
    Object.entries(golpes).filter(([h, v]) => pendiente[String(h)] == null || pendiente[String(h)] === v),
  )
  golpesPendientes.confirmar(codigo, id, golpes)
  if (Object.keys(apartados).length === 0) return
  golpesRechazados.marcar(codigo, id, apartados)
  try { localStorage.setItem(RECH_EN_KEY(codigo), String(Date.now())) } catch { /* cuota / modo privado */ }
}

export function leerRechazados(codigo: string): PendientesGrupo {
  return golpesRechazados.leer(codigo)
}

/** El servidor aceptó `enviados` para `id`: esos hoyos dejan de estar rechazados, con el valor que sea
 * (lo aceptado es más nuevo que cualquier valor rechazado de ese hoyo). */
export function confirmarRechazados(codigo: string, id: string, enviados: Record<string | number, number>): void {
  const r = golpesRechazados.leer(codigo)
  if (!r[id]) return
  const resto = { ...r[id] }
  for (const h of Object.keys(enviados)) delete resto[String(h)]
  golpesRechazados.escribir(codigo, { ...r, [id]: resto })
}

/** El marcador corrigió un hoyo de una tarjeta rechazada: el valor rechazado de ese hoyo ya no vale. */
export function olvidarRechazado(codigo: string, id: string, hoyo: number): void {
  const r = golpesRechazados.leer(codigo)
  if (!r[id] || r[id][String(hoyo)] == null) return
  const { [String(hoyo)]: _corregido, ...resto } = r[id]
  void _corregido
  golpesRechazados.escribir(codigo, { ...r, [id]: resto })
}

/** Marcas de puntos especiales de Timba libre pendientes de confirmar (ver `puntitos-pendientes.ts`). */
export const PUNTITOS_PEND_KEY = (codigo: string) => `ronda_puntitos_pendientes_${codigo}`

/**
 * Snapshot, golpes por jugador, golpes de equipo, pendientes (golpes y puntitos) y apartados del scorer de grupo.
 * Con `alFinalizar`, las marcas de puntos especiales que el servidor no confirmó se quedan
 * (una ronda finalizada se puede reabrir; Finalizar sólo espera los golpes, no las marcas).
 */
function borrarCopiaDelGrupo(codigo: string, alFinalizar = false): void {
  clearScorerGrupoSnapshot(codigo)
  try {
    localStorage.removeItem(GROUP_KEY(codigo))
    localStorage.removeItem(TEAM_KEY(codigo))
    localStorage.removeItem(PEND_KEY(codigo))
    // Al finalizar sólo pueden quedar apartados los de quien el servidor confirmó fuera de la ronda
    // (Finalizar no cierra con una tarjeta rechazada de alguien que sigue): nadie los reenvía (ya no está
    // en la ronda), así que también se van.
    borrarRechazados(codigo)
    if (!(alFinalizar && crearColaDePendientes(PUNTITOS_PEND_KEY).hay(codigo))) localStorage.removeItem(PUNTITOS_PEND_KEY(codigo))
  } catch {
    // noop
  }
}

/**
 * La ronda ya NO EXISTE (descartada o borrada, confirmado por el servidor): se borra TODA su copia
 * local en este teléfono, de los dos scorers — tarjetas y respaldos del individual (de todos los
 * jugadores, sincronizados o no) y la copia del de grupo. Una sola función: el creador puede pasar de
 * un scorer al otro en la misma ronda. Nunca para una ronda finalizada (se puede reabrir: ver
 * `cerrarCopiaLocalAlFinalizar`), ni por una lectura sin señal o una sesión vencida.
 */
export function limpiarCopiaLocalDeRonda(codigo: string): void {
  clearScoresDeRonda(codigo)
  borrarRespaldosDeRonda(codigo)
  borrarCopiaDelGrupo(codigo)
}

/**
 * El scorer de grupo finalizó la ronda con todo lo suyo enviado: se borra SU copia, pero los respaldos
 * del scorer individual que no subieron (el creador anotó sin señal en el individual y finalizó desde
 * el de grupo) no se borran: se marcan de ronda cerrada. Salen del banner, y si la ronda se reabre
 * (reabrir un torneo devuelve sus rondas a 'en_curso') son lo único que hay.
 */
export function cerrarCopiaLocalAlFinalizar(codigo: string): void {
  borrarCopiaDelGrupo(codigo, true)
  marcarRespaldosDeRondaCerrada(codigo)
}
