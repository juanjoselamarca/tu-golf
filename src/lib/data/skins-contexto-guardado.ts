/**
 * Aparte de `skins-ronda-nueva.ts` a propósito: así el recálculo pasa por el export de ese módulo (un test que lo
 * reemplaza también cubre este camino).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextoValidacionSkins } from '@/golf/formats/skins'
import { contextoDelSkinsGuardado } from '@/golf/ronda-libre/skins-congelado'
import { contextoSkinsDeRondaNueva, type RondaDelSkinsNuevo } from './skins-ronda-nueva'

/**
 * El contexto de un Skins YA CREADO (tabla en vivo, scorer, liquidación): lo congelado al crear si todavía describe la
 * ronda; si no (rondas viejas), lo recalcula con `contextoSkinsDeRondaNueva`. Fuente única de la decisión:
 * `contextoDelSkinsGuardado` en src/golf/ronda-libre/skins-congelado.ts.
 */
export async function contextoDelSkinsDeLaRonda(
  supabase: SupabaseClient,
  ronda: RondaDelSkinsNuevo,
  guardado: { reglasJuego: unknown; jugadorIds: readonly string[] },
): Promise<ContextoValidacionSkins> {
  const { contexto } = await contextoDelSkinsGuardado({
    reglasJuego: guardado.reglasJuego,
    ronda: { ...ronda, nombres: ronda.jugadores.map(j => j.nombre) },
    jugadorIds: guardado.jugadorIds,
    recalcular: () => contextoSkinsDeRondaNueva(supabase, ronda),
  })
  return contexto
}
