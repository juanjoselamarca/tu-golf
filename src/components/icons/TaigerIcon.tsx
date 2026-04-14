/**
 * tAIger+ brand monogram — bold "T" con rayas tiger como negativo.
 * Funciona en dark y light mode. Legible desde 14px.
 */
export function TaigerIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={
          // T shape
          'M5 3.5h14v4h-4v13h-6v-13H5z' +
          // Stripe knockouts (negative space) — 3 diagonal cuts
          // Stripe 1
          ' M9.8 9.2 l4.8-1 l.3 1.3 l-4.8 1 z' +
          // Stripe 2
          ' M9.8 12.7 l4.8-1 l.3 1.3 l-4.8 1 z' +
          // Stripe 3
          ' M9.8 16.2 l4.8-1 l.3 1.2 l-4.8 1 z'
        }
      />
    </svg>
  )
}
