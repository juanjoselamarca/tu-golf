import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ step: 'auth', error: authError?.message || 'No user', user: null })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      step: 'complete',
      userId: user.id,
      email: user.email,
      profile,
      profileError: profileError?.message || null,
      isAdmin: profile?.role === 'admin',
    })
  } catch (err) {
    return NextResponse.json({ step: 'crash', error: String(err) })
  }
}
