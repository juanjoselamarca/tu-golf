// The type scale for inline styles. Its values are defined once, as --fs-* in globals.css (DESIGN.md §4).
export const FONT_SIZE = {
  caption: 'var(--fs-caption)',
  small: 'var(--fs-small)',
  body: 'var(--fs-body)',
  lead: 'var(--fs-lead)',
  title: 'var(--fs-title)',
  h2: 'var(--fs-h2)',
  h1: 'var(--fs-h1)',
  hero: 'var(--fs-hero)',
  dataSm: 'var(--fs-data-sm)',
  dataMd: 'var(--fs-data-md)',
  dataLg: 'var(--fs-data-lg)',
  dataXl: 'var(--fs-data-xl)',
} as const
