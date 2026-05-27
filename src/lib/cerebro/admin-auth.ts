/**
 * Guard de auth para endpoints admin del cerebro v3.
 *
 * Ola 0: chequeo simple — cookie sb-access-token + profiles.role='admin'.
 * En olas siguientes se puede refinar (MFA, audit log, etc.) pero el patrón
 * básico ya es válido.
 */
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function isAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get('sb-access-token')?.value
  if (!token) return false
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false
  const sb = createClient(url, key)
  const { data: user } = await sb.auth.getUser(token)
  if (!user?.user) return false
  const { data: profile } = await sb
    .from('profiles')
    .select('role')
    .eq('id', user.user.id)
    .single()
  return profile?.role === 'admin'
}
