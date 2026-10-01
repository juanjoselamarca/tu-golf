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
