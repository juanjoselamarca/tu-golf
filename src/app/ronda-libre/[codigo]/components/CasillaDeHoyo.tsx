/**
 * Casilla de un hoyo en una tira de duelo (match play y parejas de la Timba): el número arriba y, abajo, un cuadrado
 * del color del lado que ganó el hoyo con su etiqueta, gris con "=" si empataron, o punteado si falta jugarlo.
 * El color manda; la etiqueta (iniciales) lo confirma para quien no distingue verde de rojo.
 */
export type LadoDeLaCasilla = 'a' | 'b' | 'empate' | 'pendiente' | 'sin_jugar'

/** Color de cada lado del duelo: el mismo en el cuadradito junto al nombre y en la casilla. */
export const COLOR_DEL_LADO = { a: 'var(--status-live-fg)', b: 'var(--double)' } as const

// Texto sobre cada fondo, con contraste AA en claro y oscuro. Sobre --double (rojo fijo en los dos temas) va blanco:
// el fondo oscuro de la app sobre ese rojo da 4,0:1.
const FONDO: Record<Exclude<LadoDeLaCasilla, 'pendiente' | 'sin_jugar'>, { bg: string; fg: string }> = {
  a: { bg: COLOR_DEL_LADO.a, fg: 'var(--bg-surface)' },
  b: { bg: COLOR_DEL_LADO.b, fg: '#ffffff' },
  empate: { bg: 'var(--text-3)', fg: 'var(--bg-surface)' },
}

/**
 * Letra de la etiqueta según cuánto ocupa: 4 caracteres (dos iniciales de 2, "PaPe") en una casilla de 30 px —tira
 * de 18 hoyos, 9 por fila, a 390 px— van a 9 px para no desbordar. El color manda; la etiqueta confirma.
 */
export function tamanoDeLetra(texto: string, tamano: number): string {
  if (texto.length >= 4) return tamano >= 36 ? '11px' : '9px'
  if (texto.length === 3) return '11px'
  return tamano >= 32 ? '13px' : '11px'
}

export function CasillaDeHoyo({ numero, lado, etiqueta, tamano, descripcion }: {
  numero: number
  lado: LadoDeLaCasilla
  /** Lo que va dentro si alguien ganó ("PT", "J"); con empate va "=", y nada si falta jugarlo. */
  etiqueta: string
  /** Lado máximo del cuadrado en px: se achica si la tira no cabe (27 hoyos, 9 por fila). */
  tamano: number
  /** Para lectores de pantalla: "Hoyo 7, ganan Pancho y Tomás". */
  descripcion: string
}) {
  const relleno = lado === 'pendiente' || lado === 'sin_jugar' ? null : FONDO[lado]
  const texto = lado === 'empate' ? '=' : lado === 'sin_jugar' ? '—' : relleno ? etiqueta : ''
  return (
    <div role="img" aria-label={descripcion} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: 0 }}>
      <span aria-hidden className="num" style={{ fontSize: tamano >= 32 ? '13px' : '11px', fontWeight: 500, lineHeight: 1, color: 'var(--text-2)' }}>
        {numero}
      </span>
      <span
        aria-hidden
        style={{
          width: '100%', maxWidth: `${tamano}px`, aspectRatio: '1', borderRadius: '8px', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: tamanoDeLetra(texto, tamano), fontWeight: 800, letterSpacing: texto.length >= 4 ? '-0.02em' : '0.02em',
          overflow: 'hidden', whiteSpace: 'nowrap',
          ...(relleno
            ? { background: relleno.bg, color: relleno.fg }
            : { border: '1.5px dashed var(--text-3)', color: 'var(--text-2)' }),
        }}
      >
        {texto}
      </span>
    </div>
  )
}
