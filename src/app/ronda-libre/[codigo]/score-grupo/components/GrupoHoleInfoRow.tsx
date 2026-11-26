'use client'

import type { ReactNode } from 'react'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface GrupoHoleInfoRowProps {
  par: number
  strokeIndex: number
  /** Yardaje del tee de referencia (el del admin si juega; si no, el de la ronda). */
  yardaje: number | null
  showNetStableford: boolean
  /** Máximo de golpes recibidos entre los jugadores en este hoyo. */
  maxStrokes: number
  /** Acción al final de la fila: el botón de compartir la ronda (`CompartirEnJuego`), igual que en el scorer individual. */
  accion: ReactNode
  theme: ScorerTheme
  /**
   * Skins: lo que vale el hoyo (1 + arrastre, `useValorDelHoyoSkins`). Reemplaza a GOLPES GRUPO: en el skins los golpes
   * son desde el más bajo, no los del hándicap absoluto. `null` = aún no se sabe (sin señal o bloqueado): la columna
   * queda con «—» (no se inventa cifra, y la fila no salta cuando llega).
   */
  skins?: { valor: number; provisional: boolean } | null
}

/**
 * Fila PAR / SI / YDS (+ GOLPES GRUPO en neto/stableford) del scorer de grupo.
 *
 * El rótulo dice GRUPO porque el número es el máximo del grupo (`maxStrokes`) y no
 * los golpes de quien mira: en un grupo con índices distintos, uno recibe 1 y otro
 * 2 en el mismo hoyo. Con "GOLPES" a secas, junto a PAR y SI —que sí son del hoyo
 * y valen para todos—, se leía como "en este hoyo recibes 2" y el que recibe 1
 * creía que la app calculaba mal.
 *
 * No dice MÁX: "golpes máximo" ya es otra cosa en golf y en este código
 * —`GOLPES_MAX_POR_HOYO`, el tope que se puede anotar en un hoyo, y en Stableford
 * el punto en que conviene levantar la bola—, así que "GOLPES MÁX +2" se puede leer
 * como "a +2 se levanta". GRUPO nombra la dimensión de la que habla el número.
 *
 * Los golpes de CADA jugador siguen estando donde sirven para anotar: los puntos
 * dorados al lado de su score, en su tarjeta.
 */
/**
 * La columna de la derecha (VALE o GOLPES GRUPO) lleva el texto más largo de la fila: crece 1,6 veces lo que PAR/SI/YDS.
 * Con las cuatro a 360 px, «GOLPES GRUPO» repartido en partes iguales llenaba sus 90 px de 90 (revisión Fable PR #888).
 */
const FLEX_COLUMNA_LARGA = '1.6 1 0%'
/** Rótulo de cada columna (PAR, SI, YDS, VALE, GOLPES GRUPO): 11 px, el mínimo legible al sol con el brazo estirado. */
const ROTULO = { fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginBottom: '1px', whiteSpace: 'nowrap' as const }

/** Lo que vale el hoyo, en palabras: lo mismo se ve y se lee en voz alta. */
export function textoDelValorSkins(skins: { valor: number; provisional: boolean }): string {
  return `${skins.provisional ? 'desde ' : ''}${cifraDelValorSkins(skins.valor)}`
}

function cifraDelValorSkins(valor: number): string {
  return `${valor} ${valor === 1 ? 'skin' : 'skins'}`
}

export function GrupoHoleInfoRow({ par, strokeIndex, yardaje, showNetStableford, maxStrokes, accion, theme, skins }: GrupoHoleInfoRowProps) {
  const conGolpesGrupo = showNetStableford && skins === undefined
  const cols = [
    { label: 'PAR', value: String(par) },
    { label: 'SI', value: String(strokeIndex) },
    // Sin yardaje auditado la columna no se dibuja. Un "—" fijo se come un
    // tercio de la fila sin decir nada, y hoy NINGUNA cancha tiene yardajes
    // verificados: el guión era lo único que veía el 100 % de los jugadores.
    ...(yardaje ? [{ label: 'YDS', value: String(yardaje) }] : []),
  ]
  return (
    // PAR, SI y YDS nunca pasan de un tercio de la fila (GOLPES GRUPO hasta 40 %; VALE sin tope, para que quepa «desde 12 skins»), y el grupo va centrado:
    // con dos columnas (stroke play bruto sin yardaje) repartirlas al 50 % dejaba
    // "PAR 4" solo en 195 px. Con tres queda igual que siempre y con cuatro el
    // flex las encoge a un cuarto.
    // La acción va fuera del grupo centrado, como en HoleInfoRow: las columnas se centran en el ancho que deja.
    <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, background: 'var(--bg-surface)', flexShrink: 0 }}>
      <div style={{ display: 'flex', flex: 1, justifyContent: 'center', minWidth: 0 }}>
        {cols.map((col, i, arr) => (
          <div key={col.label} style={{
            flex: 1, maxWidth: '33.333%', textAlign: 'center', padding: '6px 2px',
            borderRight: i < arr.length - 1 || conGolpesGrupo || skins !== undefined ? `1px solid ${theme.border}` : 'none',
          }}>
            <div style={{ ...ROTULO, color: theme.textFaint }}>{col.label}</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: theme.text }}>{col.value}</div>
          </div>
        ))}
        {skins !== undefined && (
          // «Vale 3 skins»: el número en dorado legible (--brand-on-bg) y del tamaño de PAR/SI, para leerlo al sol. Sin
          // cifra confiable, «—» en gris: la columna sigue ahí y dice que el dato no está. Es más ancha que PAR y SI
          // (1 o 2 cifras): «desde 12 skins» cabe en 390 px sin cortarse ni pisar el botón de compartir.
          <div
            role="status"
            aria-label={skins ? `Vale ${textoDelValorSkins(skins)}` : 'Valor no disponible'}
            style={{ flex: FLEX_COLUMNA_LARGA, minWidth: 0, textAlign: 'center', padding: '6px 2px' }}
          >
            <div aria-hidden style={{ ...ROTULO, color: theme.textFaint }}>VALE</div>
            <div aria-hidden style={{ fontSize: '15px', fontWeight: 700, color: skins ? 'var(--brand-on-bg)' : theme.textFaint, whiteSpace: 'nowrap' }}>
              {skins?.provisional && <span style={{ fontSize: '11px', fontWeight: 600 }}>desde </span>}
              {skins ? cifraDelValorSkins(skins.valor) : '—'}
            </div>
          </div>
        )}
        {conGolpesGrupo && (
          // Sin `minWidth: 0`: el rótulo (nowrap) nunca queda más ancho que su columna.
          <div data-columna="golpes-grupo" style={{ flex: FLEX_COLUMNA_LARGA, maxWidth: '40%', textAlign: 'center', padding: '6px 2px' }}>
            <div style={{ ...ROTULO, color: theme.textFaint }}>GOLPES GRUPO</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--brand-on-bg)' }}>{maxStrokes > 0 ? `+${maxStrokes}` : '0'}</div>
          </div>
        )}
      </div>
      {accion}
    </div>
  )
}
