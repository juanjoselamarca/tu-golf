import localFont from 'next/font/local'

// Self-hosted Google Fonts. The app writes the real family names literally ('DM Sans', not a
// generated one), so each call declares font-family itself; the --font-* variables and the
// metric-adjusted fallbacks live in globals.css. One call per subset because unicode-range
// applies to a whole call, and next/font only accepts literal options.

export const playfairDisplayCyrillic = localFont({
  src: [
    { path: './fonts/playfair-display-cyrillic.woff2', weight: '700' },
    { path: './fonts/playfair-display-cyrillic.woff2', weight: '900' },
  ],
  style: 'normal',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'Playfair Display'" },
    { prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
  ],
})

export const playfairDisplayVietnamese = localFont({
  src: [
    { path: './fonts/playfair-display-vietnamese.woff2', weight: '700' },
    { path: './fonts/playfair-display-vietnamese.woff2', weight: '900' },
  ],
  style: 'normal',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'Playfair Display'" },
    { prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' },
  ],
})

export const playfairDisplayLatinExt = localFont({
  src: [
    { path: './fonts/playfair-display-latin-ext.woff2', weight: '700' },
    { path: './fonts/playfair-display-latin-ext.woff2', weight: '900' },
  ],
  style: 'normal',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'Playfair Display'" },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
})

export const playfairDisplayLatin = localFont({
  src: [
    { path: './fonts/playfair-display-latin.woff2', weight: '700' },
    { path: './fonts/playfair-display-latin.woff2', weight: '900' },
  ],
  style: 'normal',
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'Playfair Display'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
})

export const dmSansLatinExt = localFont({
  src: [
    { path: './fonts/dm-sans-latin-ext.woff2', weight: '400' },
    { path: './fonts/dm-sans-latin-ext.woff2', weight: '500' },
    { path: './fonts/dm-sans-latin-ext.woff2', weight: '600' },
  ],
  style: 'normal',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'DM Sans'" },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
})

export const dmSansLatin = localFont({
  src: [
    { path: './fonts/dm-sans-latin.woff2', weight: '400' },
    { path: './fonts/dm-sans-latin.woff2', weight: '500' },
    { path: './fonts/dm-sans-latin.woff2', weight: '600' },
  ],
  style: 'normal',
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'DM Sans'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
})

export const dmMonoLatinExt = localFont({
  src: [
    { path: './fonts/dm-mono-300-latin-ext.woff2', weight: '300' },
    { path: './fonts/dm-mono-400-latin-ext.woff2', weight: '400' },
    { path: './fonts/dm-mono-500-latin-ext.woff2', weight: '500' },
  ],
  style: 'normal',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'DM Mono'" },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
})

export const dmMonoLatin = localFont({
  src: [
    { path: './fonts/dm-mono-300-latin.woff2', weight: '300' },
    { path: './fonts/dm-mono-400-latin.woff2', weight: '400' },
    { path: './fonts/dm-mono-500-latin.woff2', weight: '500' },
  ],
  style: 'normal',
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'DM Mono'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
})

export const cormorantGaramondCyrillicExt = localFont({
  src: [
    { path: './fonts/cormorant-garamond-cyrillic-ext.woff2', weight: '300' },
    { path: './fonts/cormorant-garamond-cyrillic-ext.woff2', weight: '400' },
    { path: './fonts/cormorant-garamond-cyrillic-ext.woff2', weight: '600' },
  ],
  style: 'normal',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'Cormorant Garamond'" },
    { prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' },
  ],
})

export const cormorantGaramondCyrillic = localFont({
  src: [
    { path: './fonts/cormorant-garamond-cyrillic.woff2', weight: '300' },
    { path: './fonts/cormorant-garamond-cyrillic.woff2', weight: '400' },
    { path: './fonts/cormorant-garamond-cyrillic.woff2', weight: '600' },
  ],
  style: 'normal',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'Cormorant Garamond'" },
    { prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
  ],
})

export const cormorantGaramondVietnamese = localFont({
  src: [
    { path: './fonts/cormorant-garamond-vietnamese.woff2', weight: '300' },
    { path: './fonts/cormorant-garamond-vietnamese.woff2', weight: '400' },
    { path: './fonts/cormorant-garamond-vietnamese.woff2', weight: '600' },
  ],
  style: 'normal',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'Cormorant Garamond'" },
    { prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' },
  ],
})

export const cormorantGaramondLatinExt = localFont({
  src: [
    { path: './fonts/cormorant-garamond-latin-ext.woff2', weight: '300' },
    { path: './fonts/cormorant-garamond-latin-ext.woff2', weight: '400' },
    { path: './fonts/cormorant-garamond-latin-ext.woff2', weight: '600' },
  ],
  style: 'normal',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'Cormorant Garamond'" },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
})

export const cormorantGaramondLatin = localFont({
  src: [
    { path: './fonts/cormorant-garamond-latin.woff2', weight: '300' },
    { path: './fonts/cormorant-garamond-latin.woff2', weight: '400' },
    { path: './fonts/cormorant-garamond-latin.woff2', weight: '600' },
  ],
  style: 'normal',
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'Cormorant Garamond'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
})
