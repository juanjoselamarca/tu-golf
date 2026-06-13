import localFont from 'next/font/local'

/**
 * Fuentes del landing, AUTO-HOSPEDADAS. Antes se cargaban vía `@import` de
 * Fontshare en marketing.css → cadena de requests (CSS del bundle → CSS de
 * Fontshare → woff2) + FOUC + dependencia externa en el critical path.
 *
 * Con `next/font/local` Next las sirve same-origin, las preloadea solo en las
 * páginas que las usan, e inyecta el `@font-face` con `display:swap`. Las woff2
 * son exactamente las que servía Fontshare (mismos pesos), así que el render es
 * idéntico. Solo se aplican en el landing: las variables se cuelgan del wrapper
 * `.home-mkt` en page.tsx, no del layout global.
 *
 * Pesos servidos por Fontshare (los replicamos tal cual): Clash 500/600/700,
 * Satoshi 400/500/700. El CSS pide font-weight:600 en contexto Satoshi → el
 * browser hace nearest-match igual que antes (no había 600 en Fontshare).
 */
export const clashDisplay = localFont({
  src: [
    { path: './fonts/ClashDisplay-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ClashDisplay-Semibold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/ClashDisplay-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-clash',
  display: 'swap',
  fallback: ['sans-serif'],
})

export const satoshi = localFont({
  src: [
    { path: './fonts/Satoshi-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Satoshi-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Satoshi-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-satoshi',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
})
