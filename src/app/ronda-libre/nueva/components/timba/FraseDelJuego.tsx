'use client'

import { useState } from 'react'
import { Check } from '@/components/icons'
import { BottomSheet } from '@/components/ui/BottomSheet'
import type { ConfigJuego } from '@/golf/formats/personalizado'
import { colores } from '../estilos'
import { fraseDelJuego, type TrozoDeFrase } from './frase-del-juego'

type Valor = Extract<TrozoDeFrase, { tipo: 'valor' }>

interface Props {
  config: ConfigJuego
  holes: number
  onConfig: (c: ConfigJuego) => void
}

/** "Así se juega": la frase con cada valor tocable; tocarlo abre sus alternativas en una hoja inferior. */
export function FraseDelJuego({ config, holes, onConfig }: Props) {
  const [abierto, setAbierto] = useState<Valor | null>(null)
  const trozos = fraseDelJuego(config, holes)

  return (
    <>
      <p style={{ margin: 0, fontSize: '17px', lineHeight: 1.9, color: colores.texto }}>
        {trozos.map((t, i) => t.tipo === 'texto'
          ? <span key={i}>{t.texto}</span>
          : (
            <button
              key={i}
              type="button"
              aria-haspopup="dialog"
              aria-label={`${t.titulo}: ${t.texto}. Cambiar`}
              onClick={() => setAbierto(t)}
              style={{
                border: 0, borderBottom: `2px dotted ${colores.oroTexto}`, background: 'transparent',
                // Alto táctil ≥44px sin romper el renglón: el padding crece hacia arriba y abajo, el margen lo compensa.
                padding: '11px 2px 2px', margin: '-11px 0 0', font: 'inherit', fontWeight: 700,
                color: colores.oroTexto, cursor: 'pointer', lineHeight: 1.4,
              }}
            >
              {t.texto}
            </button>
          ))}
      </p>
      <BottomSheet abierto={abierto != null} onCerrar={() => setAbierto(null)} etiqueta={abierto?.titulo ?? ''}>
        {abierto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{abierto.titulo}</div>
            {abierto.opciones.map(o => (
              <button
                key={o.etiqueta}
                type="button"
                aria-pressed={o.activa}
                onClick={() => { onConfig(o.config); setAbierto(null) }}
                style={{
                  minHeight: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 16px', borderRadius: '12px', fontSize: '16px', fontWeight: 600, cursor: 'pointer',
                  textAlign: 'left', color: colores.texto, background: colores.tarjeta,
                  border: o.activa ? `2px solid ${colores.texto}` : `1px solid ${colores.borde}`,
                }}
              >
                <span>{o.etiqueta.charAt(0).toUpperCase() + o.etiqueta.slice(1)}</span>
                {o.activa && <Check size={18} strokeWidth={2} aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </>
  )
}
