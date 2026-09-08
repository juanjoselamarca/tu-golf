import { Bar, ShimmerKeyframes } from '@/components/mi-golf/Shimmer'

export default function PerfilLoading() {
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
      aria-label="Cargando perfil"
    >
      <ShimmerKeyframes />
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        {/* ← Dashboard link */}
        <Bar width="90px" height={13} mb={16} />

        {/* Profile header card */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
            <Bar width="56px" height={56} radius={28} />
            <div style={{ flex: 1 }}>
              <Bar width="50%" height={18} mb={8} />
              <Bar width="35%" height={13} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Bar width="33%" height={48} radius={10} />
            <Bar width="33%" height={48} radius={10} />
            <Bar width="33%" height={48} radius={10} />
          </div>
        </div>

        {/* Dual index cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              flex: 1,
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '16px',
            }}
          >
            <Bar width="70%" height={12} mb={12} />
            <Bar width="50%" height={28} mb={8} />
            <Bar width="40%" height={11} />
          </div>
          <div
            style={{
              flex: 1,
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '16px',
            }}
          >
            <Bar width="70%" height={12} mb={12} />
            <Bar width="50%" height={28} mb={8} />
            <Bar width="40%" height={11} />
          </div>
        </div>

        {/* CPI card */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '16px',
          }}
        >
          <Bar width="40%" height={13} mb={14} />
          <Bar width="60%" height={24} mb={10} />
          <Bar width="80%" height={12} />
        </div>

        {/* Account section */}
        <Bar width="30%" height={13} mb={12} />
        <Bar width="100%" height={44} radius={10} mb={8} />
        <Bar width="100%" height={44} radius={10} />
      </div>
    </div>
  )
}
