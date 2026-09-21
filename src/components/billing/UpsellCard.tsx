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
    <div className="relative rounded-2xl border border-[var(--brand)]/20 bg-[var(--bg-surface,#f5f4f0)] p-6 text-center">
      <span
        className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: '#C4992A', color: '#070d18', fontFamily: '"DM Mono", monospace', letterSpacing: '0.06em' }}
      >
        {badge}
      </span>
      <h3 className="mt-2 text-lg font-semibold text-[var(--text,#1a1a1a)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-2,#6b7280)]">{description}</p>
      <a
        href="/planes"
        className="mt-4 inline-block rounded-xl px-6 py-2.5 text-sm font-semibold transition min-h-[44px]"
        style={{ background: '#C4992A', color: '#070d18' }}
      >
        Conocer Pro
      </a>
    </div>
  )
}
