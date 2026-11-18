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
 * Letra de la etiqueta según cuánto ocupa y el ancho REAL de la casilla (unidades `cqi` del cuadrado, que es un
 * contenedor): "PaPe" (dos iniciales de 2) cabe igual en la tira de 18 hoyos a 320 px (~23 px por casilla) que a
 * 390 px. `respaldo` es para navegadores sin container queries (iOS < 16): el tamaño que cabe en la casilla más
 * angosta. El color manda; la etiqueta confirma.
 */
export function tamanoDeLetra(texto: string, tamano: number): { fluido: string; respaldo: string } {
  if (texto.length >= 4) return { fluido: 'clamp(8px, 34cqi, 11px)', respaldo: '8px' }
  if (texto.length === 3) return { fluido: 'clamp(8px, 40cqi, 11px)', respaldo: '9px' }
  const tope = tamano >= 32 ? 13 : 11
  return { fluido: `clamp(9px, 46cqi, ${tope}px)`, respaldo: '11px' }
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
  const letra = tamanoDeLetra(texto, tamano)
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
          containerType: 'inline-size', fontSize: letra.respaldo, fontWeight: 800,
          letterSpacing: texto.length >= 4 ? '-0.02em' : '0.02em', overflow: 'hidden', whiteSpace: 'nowrap',
          ...(relleno
            ? { background: relleno.bg, color: relleno.fg }
            : { border: '1.5px dashed var(--text-3)', color: 'var(--text-2)' }),
        }}
      >
        <span style={{ fontSize: letra.fluido }}>{texto}</span>
      </span>
    </div>
  )
}
