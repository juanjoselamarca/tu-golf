import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'

export default function EnVivoLoading() {
  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            height: '28px',
            width: '40%',
            background: 'var(--surface-soft)',
            borderRadius: '6px',
            marginBottom: '12px',
          }}
        />
      </div>
      {/* Feed cards skeleton */}
      <LoadingSkeleton lines={5} />
    </div>
  )
}
