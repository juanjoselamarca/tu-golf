// Fallback de Suspense para la sección Identidad. NO incluye la barra de tabs.
// Calca el layout de IdentidadTab: índice grande, barra de niveles, grid de
// stats y card tAIger.
import { Bar, ShimmerKeyframes } from './Shimmer'

export function IdentidadSkeleton() {
  return (
    <main style={{ padding: '24px 24px 32px', maxWidth: '640px', margin: '0 auto' }} aria-busy="true" aria-label="Cargando">
      <ShimmerKeyframes />

      {/* Índice grande centrado */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '28px' }}>
        <Bar width="140px" height={64} radius={12} mb={12} />
        <Bar width="90px" height={14} />
      </div>

      {/* Barra de niveles (5 segmentos) */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '28px' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Bar key={i} width="100%" height={8} radius={4} />
        ))}
      </div>

      {/* Grid de stats 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ border: '1px solid #ececec', borderRadius: '12px', padding: '16px' }}>
            <Bar width="50%" height={12} mb={10} />
            <Bar width="70%" height={24} />
          </div>
        ))}
      </div>

      {/* Card tAIger */}
      <div style={{ border: '1px solid #ececec', borderRadius: '16px', padding: '20px' }}>
        <Bar width="30%" height={14} mb={14} />
        <Bar width="100%" height={14} mb={8} />
        <Bar width="80%" height={14} />
      </div>
    </main>
  )
}
