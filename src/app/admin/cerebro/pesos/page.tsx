import { redirect } from 'next/navigation'
import { isCerebroAdmin } from '@/lib/cerebro/admin-auth'
import { getAllWeights } from '@/lib/cerebro/weights'
import { SlidersPanel } from './SlidersPanel'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function CerebroPesosPage() {
  if (!(await isCerebroAdmin())) {
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
