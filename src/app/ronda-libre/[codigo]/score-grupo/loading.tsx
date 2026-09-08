// Skeleton del scorer por equipo. Misma estructura que score/loading pero
// con tabs de equipo visibles.
export default function ScoreGrupoLoading() {
  const bg = '#1a1a2e'
  const surface = 'rgba(255,255,255,0.06)'
  const border = 'rgba(255,255,255,0.08)'
  const shimmer = 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)'

  return (
    <div
      style={{ background: bg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
      aria-busy="true"
      aria-label="Cargando scorer de equipo"
    >
      <style>{`@keyframes sg-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>

      {/* Header */}
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px', height: '48px',
          borderBottom: `1px solid ${border}`, background: surface,
        }}
      >
        <B w="24px" h={24} s={shimmer} />
        <div style={{ textAlign: 'center' }}>
          <B w="80px" h={14} s={shimmer} mb={4} />
          <B w="100px" h={10} s={shimmer} />
        </div>
        <B w="48px" h={18} s={shimmer} />
      </header>

      {/* Progress */}
      <div style={{ height: '3px', background: border }} />

      {/* Player tabs */}
      <div style={{ display: 'flex', gap: '4px', padding: '8px 12px', borderBottom: `1px solid ${border}` }}>
        {[0, 1, 2, 3].map(i => (
          <B key={i} w="70px" h={30} s={shimmer} r={16} />
        ))}
      </div>

      {/* Hole info */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${border}`, background: surface }}>
        {['PAR', 'SI', 'YDS'].map(l => (
          <div key={l} style={{ flex: 1, textAlign: 'center', padding: '8px 2px', borderRight: `1px solid ${border}` }}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.07em', marginBottom: '4px' }}>{l}</div>
            <B w="24px" h={16} s={shimmer} mx />
          </div>
        ))}
      </div>

      {/* Score central */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <B w="96px" h={96} s={shimmer} r={16} />
        <B w="80px" h={26} s={shimmer} r={20} />
      </div>

      {/* Bottom */}
      <div style={{ padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: `1px solid ${border}`, background: surface, display: 'flex', gap: '8px' }}>
        <B w="52px" h={52} s={shimmer} r={14} />
        <B w="52px" h={52} s={shimmer} r={14} />
        <div style={{ flex: 1 }}><B w="100%" h={52} s={shimmer} r={14} /></div>
      </div>
    </div>
  )
}

function B({ w, h, s, r = 8, mb = 0, mx = false }: {
  w: string; h: number; s: string; r?: number; mb?: number; mx?: boolean
}) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r, marginBottom: mb,
      marginLeft: mx ? 'auto' : undefined, marginRight: mx ? 'auto' : undefined,
      background: s, backgroundSize: '200% 100%',
      animation: 'sg-shimmer 1.4s ease-in-out infinite',
    }} />
  )
}
