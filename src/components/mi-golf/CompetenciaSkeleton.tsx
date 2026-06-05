// Fallback de Suspense para la sección Competencia. NO incluye la barra de tabs
// (la renderiza MiGolfTabs). Calca el layout de CompetenciaTab para minimizar el
// salto cuando llega el contenido real.
import { Bar, ShimmerKeyframes } from './Shimmer'

export function CompetenciaSkeleton() {
  return (
    <main style={{ padding: '24px 24px 32px', maxWidth: '640px', margin: '0 auto' }} aria-busy="true" aria-label="Cargando">
      <ShimmerKeyframes />

      {/* Saludo + HCP */}
      <Bar width="55%" height={22} mb={10} />
      <Bar width="35%" height={14} mb={28} />

      {/* Hero card */}
      <div style={{ border: '1px solid #ececec', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
        <Bar width="40%" height={14} mb={16} />
        <Bar width="70%" height={36} mb={12} />
        <Bar width="50%" height={14} />
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <Bar width="100%" height={52} radius={12} />
        <Bar width="100%" height={52} radius={12} />
      </div>

      {/* Filas */}
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0ee' }}>
          <Bar width="44px" height={44} radius={10} />
          <div style={{ flex: 1 }}>
            <Bar width="60%" height={14} mb={8} />
            <Bar width="40%" height={12} />
          </div>
          <Bar width="48px" height={20} radius={6} />
        </div>
      ))}
    </main>
  )
}
