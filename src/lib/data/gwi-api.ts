// ─── GWI desde el cliente ───────────────────────────────────────────────────
// Única forma en que el navegador obtiene el GWI: pide el resultado ya calculado
// en el servidor (`GWIResponse`). Lo usan la vista en vivo y el scorer.

import type { GWIResponse } from '@/golf/stats/gwi'

function esGWIResponse(x: unknown): x is GWIResponse {
  const r = x as Partial<GWIResponse> | null
  return !!r && Array.isArray(r.results) && Array.isArray(r.jugadores) && typeof r.totalHoyos === 'number'
}

/** GWI de una ronda libre. `null` si la ronda no existe o la respuesta no es válida. */
export async function fetchGWIRondaLibre(codigo: string): Promise<GWIResponse | null> {
  const res = await fetch(`/api/gwi/ronda-libre/${encodeURIComponent(codigo)}`)
  if (!res.ok) return null
  const json: unknown = await res.json()
  return esGWIResponse(json) ? json : null
}
