/**
 * tAIger+ brand mark — three tiger claw slashes.
 * Diagonal strokes with slight curve. Clean, premium, aggressive.
 */
export function TaigerIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={className}
    >
      <path d="M6 3 C5 9, 4 15, 3 21" strokeWidth="2.8" />
      <path d="M13 2 C12.5 8, 12 14, 12 22" strokeWidth="3" />
      <path d="M19 3 C19.5 9, 20.5 15, 21.5 21" strokeWidth="2.8" />
    </svg>
  )
}
