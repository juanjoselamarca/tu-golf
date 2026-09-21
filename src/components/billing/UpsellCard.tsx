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
    <div
      className="relative rounded-2xl p-6 text-center"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid rgba(196, 153, 42, 0.2)',
      }}
    >
      <span
        style={{
          position: 'absolute', right: 12, top: 12,
          background: '#C4992A', color: '#070d18',
          fontFamily: '"DM Mono", monospace', fontSize: '11px',
          fontWeight: 600, letterSpacing: '0.06em',
          padding: '3px 10px', borderRadius: '4px',
        }}
      >
        {badge}
      </span>
      <h3 className="mt-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>{description}</p>
      <a
        href="/planes"
        className="mt-4 inline-block rounded-xl px-6 py-2.5 text-sm font-semibold transition"
        style={{ background: '#C4992A', color: '#070d18', minHeight: 44, lineHeight: '44px' }}
      >
        Conocer Pro
      </a>
    </div>
  )
}
