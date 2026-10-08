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
    if (s?.v !== SNAPSHOT_VERSION || !s.ronda || !s.authUserId) return null
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
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(SNAPSHOT_PREFIX)) localStorage.removeItem(k)
    }
  } catch {
    // noop
  }
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

export function leerPendientes(codigo: string): PendientesGrupo {
  try {
    return JSON.parse(localStorage.getItem(PEND_KEY(codigo)) ?? '{}')
  } catch {
    return {}
  }
}

function escribirPendientes(codigo: string, p: PendientesGrupo): void {
  try {
    const limpio = Object.fromEntries(Object.entries(p).filter(([, h]) => Object.keys(h).length > 0))
    if (Object.keys(limpio).length === 0) localStorage.removeItem(PEND_KEY(codigo))
    else localStorage.setItem(PEND_KEY(codigo), JSON.stringify(limpio))
  } catch {
    // noop
  }
}

/** Marca golpes como pendientes (último valor gana). */
export function marcarPendientes(codigo: string, id: string, golpes: Record<string | number, number>): void {
  const p = leerPendientes(codigo)
  const actual = { ...(p[id] ?? {}) }
  for (const [h, v] of Object.entries(golpes)) if (v != null) actual[String(h)] = v
  p[id] = actual
  escribirPendientes(codigo, p)
}

/**
 * El servidor confirmó `enviados`: se quitan los hoyos cuyo pendiente es EXACTAMENTE ese
 * valor. Si el marcador lo cambió mientras viajaba, sigue pendiente.
 */
export function confirmarPendientes(codigo: string, id: string, enviados: Record<string | number, number>): void {
  const p = leerPendientes(codigo)
  const actual = { ...(p[id] ?? {}) }
  for (const [h, v] of Object.entries(enviados)) if (actual[String(h)] === v) delete actual[String(h)]
  p[id] = actual
  escribirPendientes(codigo, p)
}

export function hayPendientes(codigo: string): boolean {
  return Object.keys(leerPendientes(codigo)).length > 0
}

/**
 * La ronda terminó (finalizada o descartada) en este teléfono: se borra TODA su copia
 * local del scorer de grupo — snapshot, golpes por jugador, golpes de equipo y pendientes.
 */
export function limpiarCopiaLocalDelGrupo(codigo: string): void {
  clearScorerGrupoSnapshot(codigo)
  try {
    localStorage.removeItem(GROUP_KEY(codigo))
    localStorage.removeItem(TEAM_KEY(codigo))
    localStorage.removeItem(PEND_KEY(codigo))
  } catch {
    // noop
  }
}
