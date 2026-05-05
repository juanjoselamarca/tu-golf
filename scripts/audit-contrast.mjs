// Auditoría matemática WCAG de los pares texto/fondo del sistema de tema.
// Calcula el ratio de contraste real de cada combinación canónica.
// Uso: node scripts/audit-contrast.mjs

function parseHex(hex) {
  const h = hex.replace('#', '')
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    }
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

// sRGB → linearized luminance per WCAG 2.1
function relLuminance({ r, g, b }) {
  const linearize = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function contrastRatio(hexA, hexB) {
  const La = relLuminance(parseHex(hexA))
  const Lb = relLuminance(parseHex(hexB))
  const lighter = Math.max(La, Lb)
  const darker = Math.min(La, Lb)
  return (lighter + 0.05) / (darker + 0.05)
}

function verdict(ratio) {
  if (ratio >= 7) return 'AAA ✓ (excelente)'
  if (ratio >= 4.5) return 'AA  ✓ (cumple body text)'
  if (ratio >= 3) return 'AA✗ pero OK para texto grande (≥18pt o ≥14pt bold)'
  return 'FAIL ✗ — ilegible'
}

// Tokens canónicos del sistema (extraídos de globals.css)
const LIGHT = {
  '--bg':           '#fafaf7',
  '--bg-surface':   '#ffffff',
  '--text':         '#1a1d24',
  '--text-2':       '#5a6573',
  '--text-3':       '#6B7280',
  '--brand':        '#c4992a',
  '--brand-on-bg':  '#8A6A16',
  '--brand-dark':   '#070d18',
}

const DARK = {
  '--bg':           '#070d18',
  '--bg-surface':   '#0e1c2f',
  '--text':         '#edeae4',
  '--text-2':       '#94a8c0',
  '--text-3':       '#8895a8',
  '--brand':        '#c4992a',
  '--brand-on-bg':  '#c4992a',
  '--brand-dark':   '#070d18',
}

// Pares texto/fondo que el sistema USA en la práctica
const PAIRS = [
  { texto: '--text',       fondo: '--bg',         uso: 'body text sobre fondo principal' },
  { texto: '--text',       fondo: '--bg-surface', uso: 'body text sobre cards' },
  { texto: '--text-2',     fondo: '--bg',         uso: 'texto secundario sobre fondo' },
  { texto: '--text-2',     fondo: '--bg-surface', uso: 'texto secundario sobre cards' },
  { texto: '--text-3',     fondo: '--bg',         uso: 'texto terciario / placeholders' },
  { texto: '--text-3',     fondo: '--bg-surface', uso: 'texto terciario sobre cards' },
  { texto: '--brand-on-bg',fondo: '--bg',         uso: 'CTAs gold como TEXTO (links)' },
  { texto: '--brand-on-bg',fondo: '--bg-surface', uso: 'gold como TEXTO sobre cards' },
  { texto: '--brand-dark', fondo: '--brand',      uso: 'texto sobre botón gold (CTAs)' },
]

function audit(tokens, mode) {
  console.log(`\n=== Modo ${mode.toUpperCase()} ===`)
  console.log('Texto       | Fondo        | Hex          | Ratio  | Veredicto')
  console.log('-'.repeat(95))
  let warnings = 0
  let fails = 0
  for (const { texto, fondo, uso } of PAIRS) {
    const hexT = tokens[texto]
    const hexF = tokens[fondo]
    const ratio = contrastRatio(hexT, hexF)
    const v = verdict(ratio)
    const pad = (s, n) => s.padEnd(n)
    console.log(
      `${pad(texto, 12)}| ${pad(fondo, 13)}| ${pad(hexT + ' / ' + hexF, 13)}| ${ratio.toFixed(2).padStart(5)}  | ${v}   — ${uso}`
    )
    if (ratio < 4.5 && ratio >= 3) warnings++
    if (ratio < 3) fails++
  }
  console.log(`\nResumen ${mode}: ${PAIRS.length - warnings - fails} OK, ${warnings} solo-large, ${fails} fail`)
  return { warnings, fails }
}

console.log('AUDITORÍA WCAG — Sistema de tokens light/dark')
console.log('Estándar: AA = 4.5:1 body text, 3:1 large text. AAA = 7:1.')

const lightResult = audit(LIGHT, 'light')
const darkResult = audit(DARK, 'dark')

console.log('\n=== TOTAL ===')
console.log(`Pares evaluados: ${PAIRS.length * 2} (${PAIRS.length} en cada modo)`)
console.log(`OK (AA o mejor): ${PAIRS.length * 2 - lightResult.warnings - lightResult.fails - darkResult.warnings - darkResult.fails}`)
console.log(`Solo válido para texto grande: ${lightResult.warnings + darkResult.warnings}`)
console.log(`Fail (ilegible): ${lightResult.fails + darkResult.fails}`)
