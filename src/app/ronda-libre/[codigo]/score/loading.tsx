// Skeleton del scorer: replica el layout real (header 48px + progress bar +
// mini scorecard grid + hole info + score gigante central + botones).
// Se muestra instantáneamente al navegar o reabrir la app después de inactividad,
// evitando la pantalla en blanco durante el cold start de Vercel (~3-9s).

export default function ScorerLoading() {
  // El scorer usa fondo oscuro (dark navy), así que el skeleton también
  const bg = '#1a1a2e'
  const surface = 'rgba(255,255,255,0.06)'
  const border = 'rgba(255,255,255,0.08)'
  const shimmer = 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)'

  return (
    <div
      style={{
        background: bg,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
      aria-busy="true"
      aria-label="Cargando scorer"
    >
      <style>{`@keyframes sc-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>

      {/* Header 48px */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: '48px',
          borderBottom: `1px solid ${border}`,
          background: surface,
        }}
      >
        <Bar w="24px" h={24} bg={shimmer} />
        <div style={{ textAlign: 'center' }}>
          <Bar w="80px" h={14} bg={shimmer} mb={4} />
          <Bar w="120px" h={10} bg={shimmer} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <Bar w="48px" h={18} bg={shimmer} mb={2} />
          <Bar w="64px" h={9} bg={shimmer} />
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ height: '3px', background: border }}>
        <div
          style={{
            height: '3px',
            width: '5%',
            background: shimmer,
            backgroundSize: '200% 100%',
            animation: 'sc-shimmer 1.4s ease-in-out infinite',
            borderRadius: '0 2px 2px 0',
          }}
        />
      </div>

      {/* Mini scorecard grid (9 holes) */}
      <div
        style={{
          display: 'flex',
          padding: '6px 8px',
          gap: '3px',
          borderBottom: `1px solid ${border}`,
          background: surface,
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '4px 0',
              borderRadius: '6px',
              background: i === 0 ? 'rgba(196,153,42,0.15)' : 'transparent',
            }}
          >
            <Bar w="16px" h={9} bg={shimmer} mx />
            <div style={{ height: '2px' }} />
            <Bar w="16px" h={14} bg={shimmer} mx />
          </div>
        ))}
      </div>

      {/* Hole info (PAR / SI / YDS) */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${border}`,
          background: surface,
        }}
      >
        {['PAR', 'SI', 'YDS'].map((label) => (
          <div
            key={label}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 2px',
              borderRight: `1px solid ${border}`,
            }}
          >
            <div
              style={{
                fontSize: '9px',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.07em',
                marginBottom: '4px',
              }}
            >
              {label}
            </div>
            <Bar w="24px" h={16} bg={shimmer} mx />
          </div>
        ))}
        <div style={{ width: '46px', flexShrink: 0 }} />
      </div>

      {/* Score central gigante */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '24px 0',
        }}
      >
        {/* Número grande */}
        <div
          style={{
            width: '96px',
            height: '96px',
            borderRadius: '16px',
            background: shimmer,
            backgroundSize: '200% 100%',
            animation: 'sc-shimmer 1.4s ease-in-out infinite',
          }}
        />
        {/* Chip (birdie/bogey label) */}
        <Bar w="80px" h={26} bg={shimmer} r={20} />
      </div>

      {/* Bottom buttons (+/- y Siguiente) */}
      <div
        style={{
          padding: '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          borderTop: `1px solid ${border}`,
          background: surface,
          display: 'flex',
          gap: '8px',
        }}
      >
        <Bar w="52px" h={52} bg={shimmer} r={14} />
        <Bar w="52px" h={52} bg={shimmer} r={14} />
        <div style={{ flex: 1 }}>
          <Bar w="100%" h={52} bg={shimmer} r={14} />
        </div>
      </div>
    </div>
  )
}

function Bar({ w, h, bg, r = 8, mb = 0, mx = false }: {
  w: string; h: number; bg: string; r?: number; mb?: number; mx?: boolean
}) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r,
        marginBottom: mb,
        marginLeft: mx ? 'auto' : undefined,
        marginRight: mx ? 'auto' : undefined,
        background: bg,
        backgroundSize: '200% 100%',
        animation: 'sc-shimmer 1.4s ease-in-out infinite',
      }}
    />
  )
}
