'use client'

import { Toggle } from '@/components/ui/Toggle'
import { HCP_PCT_OPCIONES } from '@/golf/core/playing-handicap'
import type { ModoJuego } from '@/golf/core/rules'
import {
  PUNTITOS_DEL_CATALOGO_SKINS, alternarPuntitoSkins, esCantidadDeHoyosDelSkins, type ConfigSkins,
} from '@/golf/formats/skins'
import { MENSAJE_SKINS_HOYOS } from '@/golf/ronda-libre/skins-de-ronda-nueva'
import { formatPesos } from '@/lib/format'
import { conPozoEscrito } from '../../hooks/skins-del-formulario'
import { colores, input, tarjeta } from '../estilos'
import { Fila, Opciones, SegmentoModo, SelectorPuntosEspeciales, caption } from '../juego/controles'
import { NOMBRE_PUNTITO } from '../timba/catalogo'
import { NOTA_SKINS } from './catalogo'

interface Props {
  skins: ConfigSkins
  onSkins: (c: ConfigSkins) => void
  /** El skins juega en el modo de la ronda. */
  modo: ModoJuego
  onModo: (m: ModoJuego) => void
  /** Los hoyos los manda la ronda (paso Cancha). */
  holes: number
}

/**
 * Las perillas del skins (spec formato-skins, «Variantes»), cada una con su explicación en una línea. Los bloqueos
 * que dependen de los jugadores (sin hándicap, más de 3 golpes por hoyo) se avisan en Jugadores y en Confirmar.
 */
export function ArmarSkins({ skins, onSkins, modo, onModo, holes }: Props) {
  const neto = modo === 'neto'
  const pozo = skins.pozoPorJugador
  const hoyosValidos = esCantidadDeHoyosDelSkins(holes)

  return (
    <div style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section aria-label="Hoyos" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={caption}>Hoyos</span>
        <span style={{ fontSize: '16px', fontWeight: 600, color: colores.texto }}>{holes} hoyos</span>
        <span style={{ fontSize: '12px', color: hoyosValidos ? colores.texto2 : 'var(--error-fg)', lineHeight: 1.4 }}>
          {hoyosValidos ? NOTA_SKINS.hoyos : MENSAJE_SKINS_HOYOS}
        </span>
      </section>

      <section aria-label="Modo" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={caption}>Modo</span>
        <SegmentoModo modo={modo} onModo={onModo} />
        <span style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }}>{neto ? NOTA_SKINS.neto : NOTA_SKINS.gross}</span>
      </section>

      {neto && (
        <Opciones
          titulo="% de hándicap"
          nota={NOTA_SKINS.hcpPct}
          valor={skins.hcpPct}
          opciones={HCP_PCT_OPCIONES.map(p => ({ valor: p, etiqueta: `${p} %` }))}
          onCambiar={p => onSkins({ ...skins, hcpPct: p })}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor="skins-pozo" style={{ fontSize: '14px', fontWeight: 600, color: colores.texto }}>Pozo por jugador</label>
        <span style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }}>{NOTA_SKINS.pozo}</span>
        <div style={{ position: 'relative' }}>
          <span aria-hidden="true" style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '16px', color: colores.texto2,
          }}>$</span>
          <input
            id="skins-pozo"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={pozo === 0 ? '' : formatPesos(pozo).slice(1)}
            onChange={e => onSkins(conPozoEscrito(skins, e.target.value))}
            style={{
              ...input, width: '100%', minHeight: '48px', paddingLeft: '28px', fontSize: '16px',
              fontFamily: 'var(--font-dm-mono), monospace',
            }}
          />
        </div>
      </div>

      <Opciones
        titulo="Si empatan el último hoyo"
        nota={NOTA_SKINS.empate}
        valor={skins.empateUltimoHoyo}
        opciones={[
          { valor: 'repartir', etiqueta: 'Repartir' },
          { valor: 'se_pierde', etiqueta: 'Se pierde' },
        ]}
        onCambiar={e => onSkins({ ...skins, empateUltimoHoyo: e })}
      />

      <Fila etiqueta="Validación" nota={NOTA_SKINS.validacion}>
        <Toggle
          checked={skins.validacion}
          onChange={v => onSkins({ ...skins, validacion: v })}
          ariaLabel="Validación"
        />
      </Fila>

      <section aria-label="Puntos especiales" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={caption}>Puntos especiales</span>
        <span style={{ fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }}>{NOTA_SKINS.puntos}</span>
        <SelectorPuntosEspeciales
          tipos={PUNTITOS_DEL_CATALOGO_SKINS}
          nombre={t => NOMBRE_PUNTITO[t]}
          activo={t => skins.puntitos.some(p => p.tipo === t)}
          onAlternar={t => onSkins(alternarPuntitoSkins(skins, t))}
        />
      </section>
    </div>
  )
}
