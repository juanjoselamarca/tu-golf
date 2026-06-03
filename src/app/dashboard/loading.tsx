// src/app/dashboard/loading.tsx
// Skeleton instantáneo mientras el server component de /dashboard corre sus
// queries. Sin esto el usuario veía pantalla blanca congelada durante todo el
// SSR (force-dynamic + 9 queries). Calca la estructura real de MiGolfTabs:
// barra de tabs sticky (640px, fondo blanco, acento #c4992a) + contenido.

function Bar({ width, height, radius = 8, mb = 0 }: { width: string; height: number; radius?: number; mb?: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        marginBottom: mb,
        background: 'linear-gradient(90deg, #f0f0ee 25%, #e6e6e3 50%, #f0f0ee 75%)',
        backgroundSize: '200% 100%',
        animation: 'mg-shimmer 1.4s ease-in-out infinite',
      }}
    />
  )
}

export default function DashboardLoading() {
  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }} aria-busy="true" aria-label="Cargando Mi Golf">
      <style>{`@keyframes mg-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>

      {/* Barra de tabs (mismas medidas que MiGolfTabs) */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          borderBottom: '1px solid #e5e5e5',
          background: '#ffffff',
          padding: '12px 16px 0',
          maxWidth: '640px',
          margin: '0 auto',
        }}
      >
        <div style={{ padding: '8px 0 10px', borderBottom: '2px solid #c4992a' }}><Bar width="92px" height={15} radius={4} /></div>
        <div style={{ padding: '8px 0 10px' }}><Bar width="72px" height={15} radius={4} /></div>
      </div>

      {/* Contenido */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px' }}>
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

        {/* Filas de rondas/torneos */}
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
      </div>
    </div>
  )
}
