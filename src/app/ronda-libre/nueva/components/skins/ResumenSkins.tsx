'use client'

import type { ModoJuego } from '@/golf/core/rules'
import type { ConfigSkins } from '@/golf/formats/skins'
import { nombreDelPuntito } from '@/golf/formats/personalizado'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import { formatPesos } from '@/lib/format'
import { colores, tarjeta } from '../estilos'
import { caption } from '../juego/controles'
import { PROBLEMA_SKINS_CARGANDO } from '../../hooks/skins-del-formulario'
import { BotonReintentar } from '../BotonReintentar'

interface Props {
  skins: ConfigSkins
  modo: ModoJuego
  jugadores: number
  /** Lo que frena crear (bloqueos del motor incluidos): se dice acá, en grande, además de bajo el botón. */
  problema: ProblemaDeLaRonda | null
  /** La lectura de la cancha falló: «Reintentar» dentro del aviso. */
  onReintentar?: () => void
}

/** Las reglas del skins antes de crear, y por qué no se puede crear si algo lo bloquea. */
export function ResumenSkins({ skins, modo, jugadores, problema, onReintentar }: Props) {
  const filas: [string, string][] = [
    ['Modo', modo === 'neto' ? `Neto al ${skins.hcpPct} %` : 'Gross'],
    ['Pozo por jugador', skins.pozoPorJugador > 0
      ? `${formatPesos(skins.pozoPorJugador)} · ${formatPesos(skins.pozoPorJugador * jugadores)} en total`
      : 'Sin plata'],
    ['Si empatan el último hoyo', skins.empateUltimoHoyo === 'repartir' ? 'Repartir' : 'Se pierde'],
    ['Validación', skins.validacion ? 'Sí' : 'No'],
    ['Puntos especiales', skins.puntitos.length > 0 ? skins.puntitos.map(nombreDelPuntito).join(', ') : 'Ninguno'],
  ]
  const bloqueo = problema && problema !== PROBLEMA_SKINS_CARGANDO ? problema : null

  return (
    <section aria-label="Reglas del skins" style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <span style={caption}>Reglas del skins</span>
      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filas.map(([dt, dd]) => (
          <div key={dt} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
            <dt style={{ fontSize: '14px', color: colores.texto2 }}>{dt}</dt>
            <dd style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: colores.texto, textAlign: 'right' }}>{dd}</dd>
          </div>
        ))}
      </dl>
      {bloqueo && (
        <div role="alert" style={{
          border: '1.5px solid var(--error-fg)', borderRadius: '10px', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: '4px',
        }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--error-fg)' }}>{bloqueo.titulo}</span>
          <span style={{ fontSize: '14px', lineHeight: 1.45, color: colores.texto }}>{bloqueo.detalle}</span>
          {onReintentar && <div style={{ marginTop: '6px' }}><BotonReintentar onReintentar={onReintentar} /></div>}
        </div>
      )}
    </section>
  )
}
