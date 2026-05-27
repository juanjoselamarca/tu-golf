import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getAllWeights } from '@/lib/cerebro/weights'
import { SlidersPanel } from './SlidersPanel'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function isAdminFromCookies(): Promise<boolean> {
  const token = (await cookies()).get('sb-access-token')?.value
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

export default async function CerebroPesosPage() {
  if (!(await isAdminFromCookies())) {
    redirect('/login?next=/admin/cerebro/pesos')
  }
  const weights = await getAllWeights()
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pesos del Cerebro V3</h1>
        <p className="text-sm text-neutral-500">
          Ajusta los pesos en vivo. El cambio se propaga a todas las instancias
          en menos de 60 segundos vía Supabase Realtime + TTL local.
        </p>
      </header>
      <SlidersPanel initialWeights={weights} />
    </main>
  )
}
