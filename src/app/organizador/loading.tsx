import { Bar, ShimmerKeyframes } from '@/components/mi-golf/Shimmer'

export default function OrganizadorLoading() {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        minHeight: '100vh',
        paddingTop: '16px',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
      }}
      aria-busy="true"
      aria-label="Cargando mis torneos"
    >
      <ShimmerKeyframes />
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        {/* Title + CTA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <Bar width="140px" height={22} />
          <Bar width="120px" height={40} radius={12} />
        </div>

        {/* Tournament cards */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              border: '1px solid rgba(196,153,42,0.22)',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <Bar width="55%" height={16} />
              <Bar width="60px" height={22} radius={6} />
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <Bar width="80px" height={13} />
              <Bar width="90px" height={13} />
              <Bar width="70px" height={13} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
