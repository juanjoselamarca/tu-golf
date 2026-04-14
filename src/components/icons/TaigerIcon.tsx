/**
 * tAIger+ brand icon — premium tiger silhouette.
 * Geometric, bold, recognizable at small sizes.
 * Matches Lucide weight but with filled accents for distinction.
 */
export function TaigerIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Ears */}
      <path d="M3 3l4 5" strokeWidth="2" />
      <path d="M21 3l-4 5" strokeWidth="2" />
      {/* Head */}
      <path d="M7 8c-1.5 2-2 4-2 6 0 3.5 3 7 7 7s7-3.5 7-7c0-2-.5-4-2-6" />
      {/* Eyes */}
      <circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none" />
      {/* Nose + mouth */}
      <path d="M12 14.5v1" strokeWidth="1.5" />
      <path d="M10 16.5c.8.8 3.2.8 4 0" strokeWidth="1.5" />
      {/* Stripes */}
      <path d="M7.5 10l2 1.5" strokeWidth="1.5" opacity="0.7" />
      <path d="M16.5 10l-2 1.5" strokeWidth="1.5" opacity="0.7" />
      <path d="M6.5 13l1.5 0.5" strokeWidth="1.5" opacity="0.5" />
      <path d="M17.5 13l-1.5 0.5" strokeWidth="1.5" opacity="0.5" />
    </svg>
  )
}
