import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
    }

    const userId = user.id

    // Admin client para eliminar datos y auth user
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Eliminar datos del usuario en orden (respetando foreign keys)
    // 1. Sesiones de tAIger+
    await adminClient.from('taiger_sessions').delete().eq('user_id', userId)

    // 2. Patrones del jugador
    await adminClient.from('player_patterns').delete().eq('user_id', userId)

    // 3. Perfil psicológico
    await adminClient.from('player_psych_profile').delete().eq('user_id', userId)

    // 4. Historial de rondas
    await adminClient.from('historical_rounds').delete().eq('user_id', userId)

    // 5. Participación en rondas libres (como jugador)
    await adminClient.from('ronda_libre_jugadores').delete().eq('user_id', userId)

    // 6. Rondas libres creadas por el usuario
    // Primero eliminar jugadores de esas rondas, luego las rondas
    const { data: rondasCreadas } = await adminClient
      .from('rondas_libres')
      .select('id')
      .eq('creador_id', userId)

    if (rondasCreadas && rondasCreadas.length > 0) {
      const rondaIds = rondasCreadas.map(r => r.id)
      await adminClient.from('ronda_libre_jugadores').delete().in('ronda_id', rondaIds)
      await adminClient.from('rondas_libres').delete().eq('creador_id', userId)
    }

    // 7. Scores de torneos
    await adminClient.from('hole_scores').delete().eq('player_id', userId)

    // 8. Inscripciones en torneos
    await adminClient.from('players').delete().eq('user_id', userId)

    // 9. Handicap history
    await adminClient.from('handicap_history').delete().eq('user_id', userId)

    // 10. Push subscriptions
    await adminClient.from('push_subscriptions').delete().eq('user_id', userId)

    // 11. Perfil
    await adminClient.from('profiles').delete().eq('id', userId)

    // 12. Eliminar usuario de auth (último paso)
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
    if (authError) {
      console.error('[delete-account] Auth delete error:', authError.message)
      return NextResponse.json({ error: 'Error al eliminar la cuenta. Contacta soporte.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Cuenta eliminada correctamente' })
  } catch (err) {
    console.error('[delete-account]', err)
    return NextResponse.json({ error: 'Error interno. Contacta soporte.' }, { status: 500 })
  }
}
