/**
 * tAIger+ brand icon — imposing tiger profile.
 * Inspired by luxury brand marks (Jaguar, Puma).
 * Side-profile silhouette: powerful jaw, alert ear, confident gaze.
 * Recognizable at 16px, striking at 48px.
 */
export function TaigerIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      {/* Tiger head — side profile silhouette */}
      <path
        d="M5 4l2 3.5
           C7 8.5 7.5 10 8 11.5
           c.5 1.5 1 3 2.5 4
           c1.5 1 3.5 1.5 5.5 1.5
           c1.5 0 3-.5 4-1.5
           c1-1 1.5-2.5 1.5-4
           c0-1.5-.5-3-1.5-4
           L21 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Eye — piercing, filled */}
      <circle cx="14" cy="10.5" r="1.25" fill="currentColor" />
      {/* Inner ear detail */}
      <path d="M6.5 5.5l1 2" stroke="currentColor" strokeWidth="1.25" opacity="0.6" />
      {/* Nose */}
      <path d="M19.5 12c0 .5-.5 1-1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Jaw line — strong, defined */}
      <path d="M18 14.5c-1 1.5-3 2.5-5.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Stripe accents — signature tiger */}
      <path d="M9 9l2 1" stroke="currentColor" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
      <path d="M8.5 12l1.5 .5" stroke="currentColor" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
    </svg>
  )
}
