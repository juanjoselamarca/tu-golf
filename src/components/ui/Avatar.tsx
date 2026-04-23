'use client'

interface AvatarProps {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE_PX: Record<NonNullable<AvatarProps['size']>, number> = {
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
}

const FONT_SIZE: Record<NonNullable<AvatarProps['size']>, number> = {
  sm: 11,
  md: 14,
  lg: 18,
  xl: 22,
}

// Paleta consistente Golfers+ — hash estable del nombre → bg + fg
const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#C4992A', fg: '#070d18' }, // brand gold
  { bg: '#0e1c2f', fg: '#C4992A' }, // deep navy
  { bg: '#1e3a5f', fg: '#ffffff' }, // mid navy
  { bg: '#2d5a3d', fg: '#ffffff' }, // forest green
  { bg: '#6b4423', fg: '#ffd98a' }, // warm brown
  { bg: '#4a2c4f', fg: '#f3c6ff' }, // plum
  { bg: '#5c3a1e', fg: '#ffd7a8' }, // sienna
  { bg: '#1a5f5a', fg: '#c6fffa' }, // teal
]

function hashName(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function initials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Avatar Golfers+ — iniciales con color derivado del nombre (audit P20).
 *
 * Uso en Momentos recientes, perfil, listados de jugadores. Si `src` está
 * presente y la imagen carga, muestra la foto; si no, cae a iniciales con
 * un color de la paleta derivado estable del nombre (mismo nombre = mismo
 * color entre sesiones).
 */
export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const px = SIZE_PX[size]
  const font = FONT_SIZE[size]
  const { bg, fg } = PALETTE[hashName(name || '?') % PALETTE.length]
  const ini = initials(name)

  const baseStyle: React.CSSProperties = {
    width: px,
    height: px,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
    userSelect: 'none',
  }

  if (src) {
    return (
      <span className={className} style={baseStyle}>
        <img
          src={src}
          alt={name}
          width={px}
          height={px}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
      </span>
    )
  }

  return (
    <span
      className={className}
      style={{
        ...baseStyle,
        background: bg,
        color: fg,
        fontFamily: 'var(--font-dm-sans), sans-serif',
        fontWeight: 700,
        fontSize: font,
        letterSpacing: '0.02em',
      }}
      aria-label={name}
      role="img"
    >
      {ini}
    </span>
  )
}
