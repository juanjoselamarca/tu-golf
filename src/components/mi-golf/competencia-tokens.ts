import type { CSSProperties } from 'react'

// Tokens de color de la pestaña Competencia (todos theme-aware vía CSS vars).
export const GOLD = 'var(--brand-on-bg)'
export const TEXT = 'var(--text)'
export const TEXT_2 = 'var(--text-2)'
export const TEXT_3 = 'var(--text-3)'
export const BORDER = 'var(--border)'
export const BORDER_SOFT = 'var(--border)'
export const BG_SOFT = 'var(--bg-surface)'
export const GREEN = 'var(--status-live-fg)'

// Link secundario de Mi Golf (subrayado fino pegado al texto). La regla global de toque
// (`a { min-height: 44px }`) estira el link a 44 px: con `borderBottom` la raya quedaba ~30 px
// bajo el texto, suelta. El subrayado va pegado al texto y el link se centra en su área de toque.
export const LINK_SECUNDARIO: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: TEXT_2,
  fontWeight: 500,
  textDecoration: 'underline',
  textDecorationColor: BORDER,
  textDecorationThickness: '1px',
  textUnderlineOffset: '4px',
}
