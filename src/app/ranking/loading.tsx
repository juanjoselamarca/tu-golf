import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'

export default function RankingLoading() {
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Title skeleton */}
      <div
        style={{
          height: '28px',
          width: '50%',
          background: 'var(--surface-soft)',
          borderRadius: '6px',
          marginBottom: '16px',
        }}
      />
      {/* Filter pills skeleton */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[80, 60, 70].map((w, i) => (
          <div
            key={i}
            style={{
              height: '32px',
              width: `${w}px`,
              background: 'var(--surface-soft)',
              borderRadius: '16px',
            }}
          />
        ))}
      </div>
      {/* Rows skeleton */}
      <LoadingSkeleton lines={8} />
    </div>
  )
}
