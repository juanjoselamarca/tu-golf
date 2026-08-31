/** Skeleton de carga para la vista pública del torneo.
 *  Next.js lo muestra automáticamente mientras el page.tsx hace fetch. */
export default function TorneoSlugLoading() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Header skeleton */}
        <div style={{ marginBottom: 32 }}>
          <div
            className="animate-pulse"
            style={{
              width: 180,
              height: 14,
              borderRadius: 6,
              background: 'var(--border, #e5e7eb)',
              marginBottom: 12,
            }}
          />
          <div
            className="animate-pulse"
            style={{
              width: 280,
              height: 28,
              borderRadius: 8,
              background: 'var(--border, #e5e7eb)',
              marginBottom: 8,
            }}
          />
          <div
            className="animate-pulse"
            style={{
              width: 200,
              height: 14,
              borderRadius: 6,
              background: 'var(--border, #e5e7eb)',
            }}
          />
        </div>

        {/* Tab bar skeleton */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[100, 80, 90].map((w, i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                width: w,
                height: 36,
                borderRadius: 8,
                background: 'var(--border, #e5e7eb)',
              }}
            />
          ))}
        </div>

        {/* Leaderboard rows skeleton */}
        <div
          style={{
            background: 'var(--bg-surface, #fff)',
            borderRadius: 14,
            border: '1px solid var(--border, #e5e7eb)',
            overflow: 'hidden',
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderBottom: i < 7 ? '1px solid var(--border, #e5e7eb)' : 'none',
              }}
            >
              <div
                className="animate-pulse"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--border, #e5e7eb)',
                  flexShrink: 0,
                }}
              />
              <div
                className="animate-pulse"
                style={{
                  flex: 1,
                  height: 14,
                  borderRadius: 6,
                  background: 'var(--border, #e5e7eb)',
                  maxWidth: 160,
                }}
              />
              <div
                className="animate-pulse"
                style={{
                  width: 50,
                  height: 14,
                  borderRadius: 6,
                  background: 'var(--border, #e5e7eb)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
