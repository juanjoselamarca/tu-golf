import { Bar, ShimmerKeyframes } from '@/components/mi-golf/Shimmer'

export default function RondaLibreLoading() {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-busy="true"
      aria-label="Cargando ronda"
    >
      <ShimmerKeyframes />
      <div style={{ textAlign: 'center', padding: '0 24px' }}>
        <Bar width="120px" height={24} mb={16} />
        <Bar width="200px" height={14} mb={8} />
        <Bar width="160px" height={14} />
      </div>
    </div>
  )
}
