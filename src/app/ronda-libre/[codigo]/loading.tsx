import { Bar, ShimmerKeyframes } from '@/components/mi-golf/Shimmer'

// Skeleton de la vista de ronda libre (leaderboard / admin / viewer).
// Se muestra al navegar a /ronda-libre/[codigo] mientras el JS carga.
export default function RondaLoading() {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        minHeight: '100vh',
        paddingTop: '16px',
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
      }}
      aria-busy="true"
      aria-label="Cargando ronda"
    >
      <ShimmerKeyframes />
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 16px' }}>
        {/* Header: nombre cancha + estado */}
        <Bar width="60%" height={20} mb={6} />
        <Bar width="40%" height={13} mb={20} />

        {/* Info card (cancha, formato, hoyos) */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <Bar width="45%" height={14} />
            <Bar width="60px" height={22} radius={6} />
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Bar width="70px" height={12} />
            <Bar width="80px" height={12} />
            <Bar width="60px" height={12} />
          </div>
        </div>

        {/* Leaderboard rows */}
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            }}
          >
            <Bar width="24px" height={24} radius={12} />
            <div style={{ flex: 1 }}>
              <Bar width="50%" height={14} mb={6} />
              <Bar width="30%" height={11} />
            </div>
            <Bar width="40px" height={20} radius={6} />
          </div>
        ))}
      </div>
    </div>
  )
}
