'use client'

import { Toggle } from '@/components/ui/Toggle'
import { HCP_PCT_OPCIONES } from '@/golf/core/playing-handicap'
import type { ModoJuego } from '@/golf/core/rules'
import {
  PUNTITOS_DEL_CATALOGO_SKINS, alternarPuntitoSkins, esCantidadDeHoyosDelSkins, type ConfigSkins,
} from '@/golf/formats/skins'
import { MENSAJE_SKINS_HOYOS } from '@/golf/ronda-libre/skins-de-ronda-nueva'
import { colores, tarjeta } from '../estilos'
import { Fila, Opciones, SegmentoModo, SelectorPuntosEspeciales, TituloDePerilla } from '../juego/controles'
import { NOMBRE_PUNTITO } from '../timba/catalogo'
import { NOTA_SKINS } from './catalogo'
import { PozoPorJugador } from './PozoPorJugador'

interface Props {
  skins: ConfigSkins
  onSkins: (c: ConfigSkins) => void
  /** El skins juega en el modo de la ronda. */
  modo: ModoJuego
  onModo: (m: ModoJuego) => void
  /** Los hoyos los manda la ronda (paso Cancha). */
  holes: number
}

const nota = { fontSize: '12px', color: colores.texto2, lineHeight: 1.4 }

/**
 * Las perillas del skins (spec formato-skins, «Variantes»), cada una con su título (mismo estilo para todas) y su
 * explicación en una línea. Los bloqueos que dependen de los jugadores (sin hándicap, más de 3 golpes por hoyo) se
 * avisan en Jugadores y en Confirmar.
 */
export function ArmarSkins({ skins, onSkins, modo, onModo, holes }: Props) {
  const neto = modo === 'neto'
  const hoyosValidos = esCantidadDeHoyosDelSkins(holes)

  return (
    <div style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section aria-label="Hoyos" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <TituloDePerilla>Hoyos</TituloDePerilla>
        <span style={{ fontSize: '16px', fontWeight: 600, color: colores.texto }}>{holes} hoyos</span>
        <span style={{ ...nota, color: hoyosValidos ? colores.texto2 : 'var(--error-fg)' }}>
          {hoyosValidos ? NOTA_SKINS.hoyos : MENSAJE_SKINS_HOYOS}
        </span>
      </section>

      <section aria-label="Modo" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <TituloDePerilla>Modo</TituloDePerilla>
        <SegmentoModo modo={modo} onModo={onModo} />
        <span style={nota}>{neto ? NOTA_SKINS.neto : NOTA_SKINS.gross}</span>
      </section>

      {neto && (
        <Opciones
          titulo="% de hándicap"
          nota={NOTA_SKINS.hcpPct}
          valor={skins.hcpPct}
          columnas={3}
          opciones={HCP_PCT_OPCIONES.map(p => ({ valor: p, etiqueta: `${p} %` }))}
          onCambiar={p => onSkins({ ...skins, hcpPct: p })}
        />
      )}

      <PozoPorJugador skins={skins} onSkins={onSkins} />

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

      <Fila etiqueta="Validación" nota={NOTA_SKINS.validacion(neto)}>
        <Toggle
          checked={skins.validacion}
          onChange={v => onSkins({ ...skins, validacion: v })}
          ariaLabel="Validación"
        />
      </Fila>

      <section aria-label="Puntos especiales" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <TituloDePerilla>Puntos especiales</TituloDePerilla>
        <span style={nota}>{NOTA_SKINS.puntos(skins.pozoPorJugador > 0)}</span>
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
