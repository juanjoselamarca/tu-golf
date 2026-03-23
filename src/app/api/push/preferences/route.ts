import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Return defaults if no preferences exist
  return NextResponse.json(data ?? {
    birdies: true,
    eagles: true,
    leader_changes: true,
    round_updates: true,
    round_finished: true,
    marketing: false,
  })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const prefs = {
    user_id: user.id,
    birdies: body.birdies ?? true,
    eagles: body.eagles ?? true,
    leader_changes: body.leader_changes ?? true,
    round_updates: body.round_updates ?? true,
    round_finished: body.round_finished ?? true,
    marketing: body.marketing ?? false,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(prefs, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ success: true })
}
