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

const SNAPSHOT_KEY = (codigo: string) => `scorer_grupo_snapshot_${codigo}`
const SNAPSHOT_VERSION = 1

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
