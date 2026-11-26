/**
 * Aparte de `skins-ronda-nueva.ts` a propósito: así el recálculo pasa por el export de ese módulo (un test que lo
 * reemplaza también cubre este camino).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextoValidacionSkins } from '@/golf/formats/skins'
import { contextoDelSkinsGuardado, leerCongeladoSkins } from '@/golf/ronda-libre/skins-congelado'
import { captureError } from '@/lib/error-tracking'
import { contextoSkinsDeRondaNueva, type RondaDelSkinsNuevo } from './skins-ronda-nueva'

/**
 * El contexto de un Skins YA CREADO (tabla en vivo, scorer, liquidación): lo congelado al crear si todavía describe la
 * ronda; si no (rondas viejas), lo recalcula con `contextoSkinsDeRondaNueva`. Fuente única de la decisión:
 * `contextoDelSkinsGuardado` en src/golf/ronda-libre/skins-congelado.ts.
 * Hay congelado pero no calza (índice o tee corregido antes del primer golpe, jugador sumado): recalcula y lo avisa
 * (warning): desde ahí la tabla ya no está protegida de un cambio del rating de la cancha. Nunca en silencio.
 */
export async function contextoDelSkinsDeLaRonda(
  supabase: SupabaseClient,
  ronda: RondaDelSkinsNuevo,
  guardado: { reglasJuego: unknown; jugadorIds: readonly string[] },
): Promise<ContextoValidacionSkins> {
  const { contexto, origen } = await contextoDelSkinsGuardado({
    reglasJuego: guardado.reglasJuego,
    ronda: { ...ronda, nombres: ronda.jugadores.map(j => j.nombre) },
    jugadorIds: guardado.jugadorIds,
    recalcular: () => contextoSkinsDeRondaNueva(supabase, ronda),
  })
  if (origen === 'recalculado' && leerCongeladoSkins(guardado.reglasJuego)) {
    void captureError(new Error('Skins: hay golpes congelados que no calzan con la ronda; se recalcularon'), {
      context: 'skins.congelado-no-calza',
      level: 'warning',
      meta: { jugadores: guardado.jugadorIds.length },
    })
  }
  return contexto
}
