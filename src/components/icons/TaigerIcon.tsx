/**
 * tAIger+ brand mark — filled tiger head silhouette.
 * Single filled shape, profile right-facing, 2 stripe knockouts, 1 eye.
 * Reads clearly at 16px. Imposing at 48px.
 */
export function TaigerIcon({ size = 20, className }: { size?: number; className?: string }) {
  const id = 'tgr' + size
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <defs>
        <clipPath id={id}>
          {/* Eye knockout */}
          <rect width="24" height="24" fill="white" />
          <circle cx="15.5" cy="10" r="1.1" fill="black" />
          {/* Stripe knockouts */}
          <rect x="7" y="8" width="4.5" height="1.1" rx="0.55" fill="black" transform="rotate(-15 9.25 8.55)" />
          <rect x="6.5" y="11.5" width="4" height="1" rx="0.5" fill="black" transform="rotate(-8 8.5 12)" />
        </clipPath>
      </defs>
      {/* Tiger silhouette */}
      <path
        d="M4.5 2.5
           L7.5 7
           C6.5 8.5 6 10.2 6 12
           c0 2.5 1 4.5 2.5 6
           c1.5 1.5 3.5 2.5 6 2.5
           c2 0 3.8-.7 5-1.8
           c1.2-1.1 2-2.8 2.2-4.7
           c.2-1.5 0-3-.5-4.5
           c-.3-.8-.5-1.5-.7-2
           L22 2.5
           l-4.5 4.5
           c-1.2-1-3-1.5-5-1.5
           c-2 0-3.8.5-5 1.5
           Z"
        fill="currentColor"
        clipPath={`url(#${id})`}
      />
    </svg>
  )
}
