/**
 * tAIger+ brand mark — tiger head silhouette.
 * Filled shape with evenodd knockouts (no clipPath — SSR safe).
 * Padding inside viewBox so it reads at 16px, not a blob.
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
        d={[
          // Outer silhouette — tiger head profile facing right
          // Ear left
          'M5 3 L7.5 7',
          // Head curve down left
          'C6.5 8.5 6 10 6.2 12',
          // Jaw curve
          'c.2 2 1 3.8 2.3 5 c1.3 1.2 3.2 2 5.5 2',
          // Chin to nose
          'c1.8 0 3.3-.5 4.3-1.3 c1-1 1.7-2.3 1.7-4',
          // Forehead
          'c0-1.8-.5-3.5-1.5-4.7',
          // Ear right
          'L21 3',
          // Top of head connecting ears
          'l-4 4.5 c-1.2-.8-2.8-1.5-4.5-1.5 c-1.8 0-3.5.6-4.5 1.5 Z',

          // Eye knockout — almond shape for character
          'M15 10 a1.3 1 0 1 0 0 .01 Z',

          // Stripe 1 knockout — angular wedge
          'M8 8.5 l3.5 .8 l-.3 1 l-3.5-.8 Z',

          // Stripe 2 knockout — shorter
          'M7.5 11.8 l3 .5 l-.2 .9 l-3-.5 Z',
        ].join(' ')}
      />
    </svg>
  )
}
