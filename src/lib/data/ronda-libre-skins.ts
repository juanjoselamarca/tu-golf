// ─── Capa de datos — Skins en la ronda libre (lo que lee el scorer) ───────────
//
// Las marcas de puntos especiales y los retiros viven en tablas privadas (sin permisos para anon ni authenticated,
// migración 20261027180000): se leen con el cliente de servicio, igual que en la Timba (`ronda-libre-timba.ts`).
// Entrega `VistaDelSkinsEnElScorer`: puntos para marcar, marcas y retiros. Sin hándicaps ni plata.

import type { SupabaseClient } from '@supabase/supabase-js'
import { esFormatoSkins } from '@/golf/formats/skins'
import { esRondaCerrada } from '@/golf/ronda-libre/estado-ronda'
import type { FilaMarcaPuntito, FilaRetiro } from '@/golf/ronda-libre/juego-de-la-ronda'
import { leerReglasSkins, vistaDelSkinsEnElScorer, type VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'

export type SkinsDelScorer =
  | { status: 'ok'; vista: VistaDelSkinsEnElScorer }
  /** Reglas guardadas que no se pueden leer: no se inventa un skins (mismo motivo que la Timba). */
  | { status: 'sin_juego'; rondaCerrada: boolean }
  | { status: 'no_es_skins' }
  | { status: 'not_found' }
  | { status: 'error' }

export async function cargarSkinsDelScorer(admin: SupabaseClient, codigo: string): Promise<SkinsDelScorer> {
  const ronda = await admin.from('rondas_libres').select('id, formato_juego, reglas_juego, estado').eq('codigo', codigo).maybeSingle()
  if (ronda.error) return { status: 'error' }
  if (!ronda.data) return { status: 'not_found' }
  const fila = ronda.data as { id: string; formato_juego: string | null; reglas_juego: unknown; estado: string | null }
  if (!esFormatoSkins(fila.formato_juego)) return { status: 'no_es_skins' }
  const rondaCerrada = esRondaCerrada(fila.estado)
  const reglas = leerReglasSkins(fila.reglas_juego)
  if (!reglas) return { status: 'sin_juego', rondaCerrada }

  const [marcas, retiros] = await Promise.all([
    admin
      .from('ronda_libre_puntitos')
      .select('id, jugador_id, hoyo, puntito_id, created_at')
      .eq('ronda_id', fila.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    admin.from('ronda_libre_retiros').select('jugador_id, desde_hoyo').eq('ronda_id', fila.id),
  ])
  if (marcas.error || retiros.error) return { status: 'error' }
  return {
    status: 'ok',
    vista: vistaDelSkinsEnElScorer({
      reglas,
      marcas: (marcas.data ?? []) as FilaMarcaPuntito[],
      retiros: (retiros.data ?? []) as FilaRetiro[],
      rondaCerrada,
    }),
  }
}
