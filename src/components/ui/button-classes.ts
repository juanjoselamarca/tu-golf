// Sin 'use client': un Server Component puede llamar a buttonClassName para pintar un Link como botón.

export type Variant = 'commit' | 'nav' | 'ghost' | 'destructive'
export type Size = 'sm' | 'md' | 'lg'

// Nota: el token de Tailwind config se llama `gold` (no `brand`).
// El alias semántico `brand` existe solo en CSS vars (--brand).
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-on-bg)] focus-visible:ring-offset-2 ' +
  'select-none'

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm min-w-[44px]',
  md: 'h-12 px-5 text-base min-w-[44px]',
  lg: 'h-14 px-6 text-base min-w-[44px]',
}

// Oro COMO TEXTO va con --brand-on-bg (`text-gold-text`), nunca `text-gold`:
// #c4992a sobre blanco da 2.65:1 y reprueba WCAG AA; --brand-on-bg da
// 5.06:1 en claro y 6.47:1 en oscuro. El borde de `nav` usa el mismo token
// (con `border-gold/60` medía 1.74:1 en claro), igual que el CTA de UpsellCard.
const VARIANTS: Record<Variant, string> = {
  commit:
    'bg-gold text-bg-deep hover:bg-gold/90 active:bg-gold/80 shadow-sm',
  nav:
    'bg-transparent text-gold-text border border-[color:var(--brand-on-bg)] hover:bg-gold/10 active:bg-gold/20',
  ghost:
    'bg-transparent text-gold-text hover:bg-gold/10 active:bg-gold/20',
  destructive:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
}

/** Las clases de un Button, para un `Link` que navega pero tiene que verse y enfocarse como botón. */
export function buttonClassName({ variant = 'commit', size = 'md', fullWidth = false }: {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
} = {}): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${fullWidth ? 'w-full' : ''}`
}
