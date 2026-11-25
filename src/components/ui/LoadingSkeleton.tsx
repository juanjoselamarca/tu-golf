'use client'

// Skeleton estático (DESIGN.md §13: sin pulsos ni shimmer). El barrido en bucle que
// tenía antes ignoraba prefers-reduced-motion.
export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ padding: '16px' }} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height:       '20px',
            background:   'var(--surface-border)',
            borderRadius: '8px',
            marginBottom: '12px',
            width:        i === lines - 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  )
}
