'use client'

import { useState } from 'react'
import { BannerDeJuego } from '../juego/BannerDeJuego'
import { FilaJuegoConCandado } from '../juego/FilaJuegoConCandado'
import { COMO_SE_JUEGA_SKINS, SUBTITULO_SKINS, TITULO_SKINS } from './catalogo'

interface Props {
  /** Permiso (`puedeCrearJuegoPersonalizado`) y el interruptor `SKINS_LIBRE_ABIERTO`. */
  puedeElegir: boolean
  activa: boolean
  onElegir: () => void
}

/** Skins en el selector de formato, con el mismo candado que la Timba. La "i" explica el juego, para todos. */
export function FilaSkins({ puedeElegir, activa, onElegir }: Props) {
  const [banner, setBanner] = useState(false)
  return (
    <>
      <FilaJuegoConCandado
        titulo={TITULO_SKINS}
        subtitulo={SUBTITULO_SKINS}
        puedeElegir={puedeElegir}
        activa={activa}
        onElegir={onElegir}
        info={{ etiqueta: 'Cómo se juega Skins', onAbrir: () => setBanner(true) }}
      />
      <BannerDeJuego
        abierto={banner}
        onCerrar={() => setBanner(false)}
        titulo={TITULO_SKINS}
        subtitulo={SUBTITULO_SKINS}
        proximamente={!puedeElegir}
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {COMO_SE_JUEGA_SKINS.map((linea, i) => (
            <li key={linea} style={{
              fontSize: '15px', lineHeight: 1.45, padding: '12px 0',
              borderBottom: i < COMO_SE_JUEGA_SKINS.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {linea}
            </li>
          ))}
        </ul>
      </BannerDeJuego>
    </>
  )
}
