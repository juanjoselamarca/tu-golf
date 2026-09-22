'use client'
import type { Feature } from '@/golf/billing/plans'
import { FEATURE_MIN_TIER } from '@/golf/billing/plans'

interface UpsellCardProps {
  feature: Feature
  title: string
  description: string
  /** compact = inline 72px, medium = card 160px (default), full = section 280px */
  variant?: 'compact' | 'medium' | 'full'
}

export function UpsellCard({ feature, title, description, variant = 'medium' }: UpsellCardProps) {
  const tier = FEATURE_MIN_TIER[feature]
  const badge = tier === 'pro_plus' ? 'PRO+' : 'PRO'

  const minHeight = variant === 'compact' ? 72 : variant === 'full' ? 280 : 160

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ minHeight }}
    >
      {/* Glass overlay */}
      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6"
        style={{
          background: 'rgba(14, 28, 47, 0.65)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {/* Badge */}
        <span
          style={{
            background: '#C4992A',
            color: '#070d18',
            fontFamily: '"DM Mono", monospace',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            padding: '3px 10px',
            borderRadius: '4px',
          }}
        >
          {badge}
        </span>

        {/* Title */}
        <h3
          className="text-center font-semibold"
          style={{
            color: '#FFFFFF',
            fontSize: variant === 'compact' ? '14px' : '16px',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h3>

        {/* Description — hidden in compact */}
        {variant !== 'compact' && (
          <p
            className="max-w-xs text-center"
            style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}

        {/* CTA */}
        <a
          href="/planes"
          className="inline-flex items-center justify-center rounded-xl font-semibold transition-opacity hover:opacity-90"
          style={{
            background: '#C4992A',
            color: '#070d18',
            fontSize: '14px',
            padding: variant === 'compact' ? '8px 20px' : '12px 28px',
            minHeight: '44px',
            minWidth: '44px',
          }}
        >
          Conocer {badge}
        </a>
      </div>

      {/* Background placeholder */}
      <div
        className="pointer-events-none select-none"
        style={{
          minHeight,
          background: 'var(--bg-surface)',
          border: '1px solid rgba(196, 153, 42, 0.12)',
          borderRadius: '16px',
        }}
      />
    </div>
  )
}
