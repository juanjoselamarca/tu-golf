'use client'
import { adminColors, adminFonts } from './admin-tokens'

interface FunnelStep {
  label: string
  value: number
  total: number
}

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {steps.map((step, i) => {
        const pct = step.total > 0 ? (step.value / step.total) * 100 : 0
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ ...adminFonts.body, fontSize: '13px' }}>{step.label}</span>
              <span style={{ ...adminFonts.mono, fontSize: '12px', color: adminColors.gold }}>
                {step.value} ({pct.toFixed(0)}%)
              </span>
            </div>
            <div style={{
              height: '8px', borderRadius: '4px', background: adminColors.bg, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: '4px', width: `${pct}%`,
                background: `linear-gradient(90deg, ${adminColors.gold}, ${adminColors.gold}dd)`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
