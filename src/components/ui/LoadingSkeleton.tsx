'use client'

export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ padding: '20px' }}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height:           '20px',
            background:       'linear-gradient(90deg, var(--bg-surface) 25%, var(--border) 50%, var(--bg-surface) 75%)',
            backgroundSize:   '200% 100%',
            animation:        'shimmer 1.5s infinite',
            borderRadius:     '4px',
            marginBottom:     '12px',
            width:            i === lines - 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  )
}
