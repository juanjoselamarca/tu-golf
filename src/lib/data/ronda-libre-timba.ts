// ─── Capa de datos — Timba libre (formato `personalizado`) ────────────────────
//
// Lee lo que la Timba necesita y entrega la VISTA del juego (`vistaDelJuego`): puntos y golpes recibidos por
// hoyo, nunca el hándicap ni el índice de nadie (decisión de Juanjo, 27-oct).
//
// `admin` = cliente de servicio: las marcas y los retiros viven en tablas privadas (sin permisos para anon ni
// authenticated, migración 20261027180000). `leerIndices` es OBLIGATORIO y no admite `null`: el neto solo se
// calcula con un lector real (contrato, cláusula 1). Desde una ruta: `indicesDePerfil`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularJuegoPersonalizado, esFormatoPersonalizado } from '@/golf/formats/personalizado'
import {
  armarEntradaDelJuego,
  vistaDelJuego,
  type FilaMarcaPuntito,
  type FilaRetiro,
  type MotivoSinJuego,
  type VistaDelJuego,
} from '@/golf/ronda-libre/juego-de-la-ronda'
import { cargarRondaLibreEnVivo } from './ronda-libre'
import type { LeerIndicesDePerfil } from './indices-de-perfil-lectura'

export type JuegoDeLaRonda =
  | { status: 'ok'; vista: VistaDelJuego }
  | { status: 'sin_juego'; motivo: MotivoSinJuego }
  | { status: 'no_es_timba' }
  | { status: 'not_found' }
  | { status: 'error' }

export async function cargarJuegoDeLaRonda(
  admin: SupabaseClient,
  codigo: string,
  leerIndices: LeerIndicesDePerfil,
): Promise<JuegoDeLaRonda> {
  const res = await cargarRondaLibreEnVivo(admin, codigo, leerIndices)
  if (res.status === 'not_found') return { status: 'not_found' }
  if (res.status !== 'ok') return { status: 'error' }
  const { ronda } = res
  if (!esFormatoPersonalizado(ronda.formato_juego)) return { status: 'no_es_timba' }

  // Columnas y tablas nuevas: se leen aparte para no tocar COLUMNAS_RONDA_EN_VIVO, que usan todas las rondas.
  const [reglas, marcas, retiros] = await Promise.all([
    admin.from('rondas_libres').select('reglas_juego').eq('id', ronda.id).single(),
    admin
      .from('ronda_libre_puntitos')
      .select('id, jugador_id, hoyo, puntito_id, created_at')
      .eq('ronda_id', ronda.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    admin.from('ronda_libre_retiros').select('jugador_id, desde_hoyo').eq('ronda_id', ronda.id),
  ])
  if (reglas.error || marcas.error || retiros.error) return { status: 'error' }

  const armada = armarEntradaDelJuego({
    reglasJuego: (reglas.data as { reglas_juego: unknown } | null)?.reglas_juego ?? null,
    ronda: { holes: ronda.holes, hoyo_inicio: ronda.hoyo_inicio ?? null, estado: ronda.estado ?? null },
    jugadores: ronda.ronda_libre_jugadores.map(j => ({ id: j.id, scores: (j.scores ?? null) as Record<string, unknown> | null })),
    mapasHandicap: { courseHcpMap: res.courseHcpMap, sinIndice: res.sinIndice },
    parMap: res.parMap,
    siMap: res.siMap,
    marcas: (marcas.data ?? []) as FilaMarcaPuntito[],
    retiros: (retiros.data ?? []) as FilaRetiro[],
  })
  if (!armada.ok) return { status: 'sin_juego', motivo: armada.motivo }
  return { status: 'ok', vista: vistaDelJuego(armada.entrada, armada.jugadorIds, calcularJuegoPersonalizado(armada.entrada)) }
}
