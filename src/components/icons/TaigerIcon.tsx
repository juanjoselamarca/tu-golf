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
      <path d="M4 4l3 4M20 4l-3 4" />
      <path d="M9 8a6 6 0 0 0-2 4c0 4 3 8 5 8s5-4 5-8a6 6 0 0 0-2-4" />
      <circle cx="10" cy="12" r="0.5" fill="currentColor" />
      <circle cx="14" cy="12" r="0.5" fill="currentColor" />
      <path d="M12 14v1.5" />
      <path d="M10.5 16.5c.5.5 2.5.5 3 0" />
      <path d="M8.5 10l1.5 1M15.5 10l-1.5 1" />
    </svg>
  )
}
