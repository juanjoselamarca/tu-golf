'use client'

import { colores, etiqueta, opcion } from './estilos'

const OPCIONES_DRIVES = [
  { valor: false, titulo: 'No' },
  { valor: true, titulo: 'Sí' },
] as const

interface Props {
  anotarDrives: boolean
  /** Mínimo por jugador que vale ahora (0 = sin mínimo; `useEquiposDeClub.drivesMinimo`). `null` = el modo no se juega a esos hoyos. */
  minimo: number | null
  /** Tope del mínimo para estos hoyos (`drivesMinimoMaximo`). */
  maximo: number | null
  onElegir: (si: boolean) => void
  onMinimo: (n: number) => void
}

/**
 * «¿Anotar drives?» (registro opcional, src/golf/formats/drives-scramble.ts). Viene en «No» (default seguro: sin
 * tocarlo la ronda es la de siempre; después de crear no se activa). Con Sí, cada tarjeta pide los jugadores del
 * equipo y se elige el mínimo de drives por jugador, que cambia de un campeonato a otro.
 */
export function SelectorAnotarDrives({ anotarDrives, minimo, maximo, onElegir, onMinimo }: Props) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div id="equipos-club-drives" style={{ ...etiqueta, fontSize: '14px', color: colores.texto }}>¿Anotar drives?</div>
      <div role="group" aria-labelledby="equipos-club-drives" style={{ display: 'flex', gap: '8px' }}>
        {OPCIONES_DRIVES.map(op => {
          const activo = anotarDrives === op.valor
          return (
            <button
              key={op.titulo}
              type="button"
              aria-pressed={activo}
              onClick={() => onElegir(op.valor)}
              style={{
                ...opcion(activo), flex: 1, minHeight: '48px', padding: '12px', textAlign: 'center',
                fontSize: '14px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto,
              }}
            >
              {op.titulo}
            </button>
          )
        })}
      </div>
      {anotarDrives && (
        <>
          {minimo != null && maximo != null && (
            <MinimoDeDrives minimo={minimo} maximo={maximo} onMinimo={onMinimo} />
          )}
        </>
      )}
    </div>
  )
}

/** Solo el 0 necesita explicarse: con mínimo, el número del − 4 + ya lo dice y el + se frena solo en el tope. */
function textoDelMinimo(minimo: number): string | null {
  return minimo === 0 ? 'Sin mínimo: solo se cuentan los drives de cada uno.' : null
}

/** − 4 +: el mínimo por jugador, de 0 al tope de los hoyos. Botones de 48px: se usa con una mano y con guante. */
function MinimoDeDrives({ minimo, maximo, onMinimo }: { minimo: number; maximo: number; onMinimo: (n: number) => void }) {
  const boton = (habilitado: boolean) => ({
    width: '48px', height: '48px', flexShrink: 0, borderRadius: '12px',
    border: `1px solid ${habilitado ? colores.inputBorde : colores.borde}`,
    background: colores.inputFondo, color: habilitado ? colores.texto : colores.texto3,
    fontSize: '24px', fontWeight: 600, lineHeight: 1, cursor: habilitado ? 'pointer' : 'not-allowed',
    WebkitTapHighlightColor: 'transparent',
  })
  return (
    <div style={{ marginTop: '12px', padding: '12px', borderRadius: '12px', border: `1px solid ${colores.borde}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div id="equipos-club-drives-minimo">
          <div style={{ fontSize: '16px', fontWeight: 600, color: colores.texto }}>Mínimo por jugador</div>
        </div>
        <div role="group" aria-labelledby="equipos-club-drives-minimo" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            aria-label="Bajar el mínimo de drives"
            disabled={minimo <= 0}
            onClick={() => onMinimo(minimo - 1)}
            style={boton(minimo > 0)}
          >
            −
          </button>
          <output
            aria-live="polite"
            data-testid="drives-minimo"
            className="num"
            style={{
              minWidth: '40px', textAlign: 'center', fontSize: '24px', fontWeight: 600, color: colores.texto,
            }}
          >
            {minimo}
          </output>
          <button
            type="button"
            aria-label="Subir el mínimo de drives"
            disabled={minimo >= maximo}
            onClick={() => onMinimo(minimo + 1)}
            style={boton(minimo < maximo)}
          >
            +
          </button>
        </div>
      </div>
      {textoDelMinimo(minimo) && (
        <div style={{ fontSize: '13px', color: colores.texto2, marginTop: '8px', lineHeight: 1.4 }}>
          {textoDelMinimo(minimo)}
        </div>
      )}
    </div>
  )
}
