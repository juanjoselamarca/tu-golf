/**
 * Vista de una Timba armada de punta a punta con el motor real (solo para tests): reglas guardadas → entrada →
 * `calcularJuegoPersonalizado` → `VistaDelJuego`. Así los tests de la pestaña Juego nunca inventan un resultado.
 */
import { armarReglasGuardadas, calcularJuegoPersonalizado, crearConfigDePlantilla, type ConfigJuego } from '@/golf/formats/personalizado'
import { armarEntradaDelJuego, vistaDelJuego, type VistaDelJuego } from '../juego-de-la-ronda'

export const ID = {
  pancho: '00000000-0000-4000-8000-0000000000a1',
  cristobal: '00000000-0000-4000-8000-0000000000a2',
  tomas: '00000000-0000-4000-8000-0000000000a3',
  nico: '00000000-0000-4000-8000-0000000000a4',
} as const
export const IDS = [ID.pancho, ID.cristobal, ID.tomas, ID.nico]
export const NOMBRES: Record<string, string> = {
  [ID.pancho]: 'Pancho Vial', [ID.cristobal]: 'Cristóbal Errázuriz', [ID.tomas]: 'Tomás Lira', [ID.nico]: 'Nico Soto',
}

/** La Colombiana con sorteo fijo: tramo 1 = A+B vs C+D, tramo 2 = A+C vs B+D, tramo 3 = A+D vs B+C. */
export const COLOMBIANA: ConfigJuego = { ...crearConfigDePlantilla('colombiana'), sorteo: [0, 1, 2] }

export function vistaDeTimba(opciones: {
  config: ConfigJuego
  /** Golpes por jugador y hoyo. */
  scores: Record<string, Record<number, number>>
  ids?: string[]
  holes?: number
  hoyoInicio?: number
  modo?: 'gross' | 'neto'
  ch?: Record<string, number>
  retiros?: Record<string, number>
  marcas?: { jugadorId: string; hoyo: number; puntitoId: string }[]
  cerrada?: boolean
}): VistaDelJuego {
  const ids = opciones.ids ?? IDS
  const holes = opciones.holes ?? 18
  const config: ConfigJuego = { ...opciones.config, modo: opciones.modo ?? opciones.config.modo }
  const numeros = Array.from({ length: 18 }, (_, i) => i + 1)
  const r = armarEntradaDelJuego({
    reglasJuego: armarReglasGuardadas(config, ids),
    ronda: { holes, hoyo_inicio: opciones.hoyoInicio ?? 1, estado: opciones.cerrada ? 'finalizada' : 'en_curso' },
    jugadores: ids.map(id => ({ id, scores: opciones.scores[id] ?? {} })),
    mapasHandicap: { courseHcpMap: opciones.ch ?? Object.fromEntries(ids.map(id => [id, 0])), sinIndice: [] },
    parMap: Object.fromEntries(numeros.map(n => [n, 4])),
    siMap: Object.fromEntries(numeros.map(n => [n, n])),
    marcas: (opciones.marcas ?? []).map((m, i) => ({
      id: `m${i}`, jugador_id: m.jugadorId, hoyo: m.hoyo, puntito_id: m.puntitoId, created_at: `2026-11-18T12:00:0${i % 10}Z`,
    })),
    retiros: Object.entries(opciones.retiros ?? {}).map(([jugador_id, desde_hoyo]) => ({ jugador_id, desde_hoyo })),
  })
  if (!r.ok) throw new Error(r.motivo)
  return vistaDelJuego(r.entrada, r.jugadorIds, calcularJuegoPersonalizado(r.entrada))
}

/** Golpes iguales para todos en `hoyos`, salvo los que se pisan en `distintos` ({ hoyo: { id: golpes } }). */
export function golpesDe(
  hoyos: readonly number[],
  distintos: Record<number, Record<string, number>> = {},
  ids: readonly string[] = IDS,
): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = Object.fromEntries(ids.map(id => [id, {}]))
  for (const h of hoyos) for (const id of ids) out[id][h] = distintos[h]?.[id] ?? 4
  return out
}
