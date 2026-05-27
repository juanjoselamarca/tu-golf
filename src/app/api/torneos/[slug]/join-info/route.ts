import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { fetchJoinInfo } from '@/lib/data/tournaments/joinFlow'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const info = await fetchJoinInfo(admin, params.slug, user.id)
  if (!info) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(info)
}
