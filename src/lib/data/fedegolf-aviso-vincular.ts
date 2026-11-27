import type { SupabaseClient, User } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { AVISO_VINCULAR_FEDEGOLF_VISTO, avisoVincularYaVisto, debeMostrarAvisoVincular } from '@/lib/fedegolf/aviso-vincular'

/**
 * Datos del aviso «Vincula tu FedeGolf» (reglas puras en `lib/fedegolf/aviso-vincular`).
 */
async function tieneVinculoFedegolf(supabase: SupabaseClient, userId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('fedegolf_credentials')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    void captureError(error, { context: 'aviso-vincular-fedegolf.vinculo', level: 'warning' })
    return null
  }
  return data != null
}

/**
 * ¿Juega o anota una ronda en curso? Las rondas de torneo también viven en `rondas_libres`
 * (tournament_groups.ronda_libre_id), así que una sola tabla cubre ambas. Como jugador
 * (ronda_libre_jugadores) o como creador/anotador (rondas_libres.creador_id).
 */
async function estaEnRonda(supabase: SupabaseClient, userId: string): Promise<boolean | null> {
  const [comoJugador, comoCreador] = await Promise.all([
    supabase
      .from('ronda_libre_jugadores')
      .select('ronda_id, rondas_libres!inner(estado)')
      .eq('user_id', userId)
      .eq('rondas_libres.estado', 'en_curso')
      .limit(1),
    supabase
      .from('rondas_libres')
      .select('id')
      .eq('creador_id', userId)
      .eq('estado', 'en_curso')
      .limit(1),
  ])
  const error = comoJugador.error ?? comoCreador.error
  if (error) {
    void captureError(error, { context: 'aviso-vincular-fedegolf.ronda-en-curso', level: 'warning' })
    return null
  }
  return (comoJugador.data?.length ?? 0) > 0 || (comoCreador.data?.length ?? 0) > 0
}

export async function fetchDebeMostrarAvisoVincular(supabase: SupabaseClient, user: User): Promise<boolean> {
  if (avisoVincularYaVisto(user)) return false
  const [tieneVinculo, enRonda] = await Promise.all([
    tieneVinculoFedegolf(supabase, user.id),
    estaEnRonda(supabase, user.id),
  ])
  return debeMostrarAvisoVincular({ yaVisto: false, tieneVinculo, enRonda })
}

/** Marca el aviso como visto para siempre (todas las sesiones del usuario). */
export async function marcarAvisoVincularVisto(supabase: SupabaseClient, ahora = new Date()): Promise<boolean> {
  const { error } = await supabase.auth.updateUser({ data: { [AVISO_VINCULAR_FEDEGOLF_VISTO]: ahora.toISOString() } })
  if (error) {
    void captureError(error, { context: 'aviso-vincular-fedegolf.marcar-visto', level: 'warning' })
    return false
  }
  return true
}
