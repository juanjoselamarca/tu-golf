'use client'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface ServiceHealth {
  name: string
  ok: boolean
  ms: number
  status?: string
}

export function HealthGrid({ services, loading }: { services: ServiceHealth[]; loading?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ ...adminCard, height: '80px', opacity: 0.5 }} />
        ))
      ) : (
        services.map(svc => {
          const isOk = svc.ok && svc.status !== 'not_configured'
          const isNotConfigured = svc.status === 'not_configured'
          const dotColor = isNotConfigured ? adminColors.grayDim : isOk ? adminColors.green : adminColors.red

          return (
            <div key={svc.name} style={{ ...adminCard, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%', background: dotColor,
                  boxShadow: isOk ? `0 0 6px ${dotColor}` : 'none', flexShrink: 0,
                }} />
                <span style={{ color: adminColors.ivory, fontSize: '13px', fontWeight: 600 }}>{svc.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...adminFonts.mono, fontSize: '11px', color: dotColor }}>
                  {isNotConfigured ? 'No config' : isOk ? 'Operativo' : 'Error'}
                </span>
                {svc.ms > 0 && (
                  <span style={{ ...adminFonts.mono, fontSize: '10px' }}>{svc.ms}ms</span>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
