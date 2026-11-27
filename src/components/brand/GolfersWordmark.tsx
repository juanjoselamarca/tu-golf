/**
 * Logotipo de Golfers+: "Golfers" en el color del texto + "+" dorado, DM Sans 700 (el del Navbar).
 *
 * El "+" usa `--brand-on-bg` (oro legible como texto en ambos temas) y no el #C4992A fijo del
 * Navbar: acá el "+" distingue el índice Golfers+ del oficial y tiene que leerse al sol en tema
 * claro. `src/components/Navbar.tsx` (archivo protegido) mantiene su copia inline; se migra a
 * este componente cuando se toque con el protocolo de archivos protegidos.
 */
interface Props {
  /** Tamaño de la letra, en px. */
  tamano: number
  /** Nombre accesible (role="img"). */
  label: string
}

export function GolfersWordmark({ tamano, label }: Props) {
  const letra: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans), "DM Sans", system-ui, sans-serif',
    fontWeight: 700, fontSize: `${tamano}px`, letterSpacing: '-0.02em', lineHeight: 1,
  }
  return (
    <span role="img" aria-label={label} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '1px' }}>
      <span aria-hidden style={{ ...letra, color: 'var(--text)' }}>Golfers</span>
      <span aria-hidden style={{ ...letra, color: 'var(--brand-on-bg)' }}>+</span>
    </span>
  )
}
