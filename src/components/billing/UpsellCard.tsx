'use client'
import type { Feature } from '@/golf/billing/plans'
import { FEATURE_MIN_TIER } from '@/golf/billing/plans'

interface UpsellCardProps {
  feature: Feature
  title: string
  description: string
}

export function UpsellCard({ feature, title, description }: UpsellCardProps) {
  const tier = FEATURE_MIN_TIER[feature]
  const badge = tier === 'pro_plus' ? 'PRO+' : 'PRO'
  return (
    <div className="relative rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-center">
      <span className="absolute right-3 top-3 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">{badge}</span>
      <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
      <a href="/planes" className="mt-4 inline-block rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-sm font-semibold text-slate-900 transition hover:from-amber-400 hover:to-amber-500">
        Activar mi plan
      </a>
    </div>
  )
}
