'use client'

import { useState } from 'react'
import { FilaJuegoConCandado } from '../juego/FilaJuegoConCandado'
import { BannerTimba } from './BannerTimba'
import { SUBTITULO_TIMBA, TITULO_TIMBA } from './catalogo'

interface Props {
  /** Lo decide `puedeCrearJuegoPersonalizado` (vía /api/ronda-libre/permiso-timba). */
  puedeElegir: boolean
  activa: boolean
  onElegir: () => void
}

/** Timba libre en el selector de formato (maqueta Bloqueo), con el candado compartido. La "i" abre el banner de juegos. */
export function FilaTimbaLibre({ puedeElegir, activa, onElegir }: Props) {
  const [banner, setBanner] = useState(false)
  return (
    <>
      <FilaJuegoConCandado
        titulo={TITULO_TIMBA}
        subtitulo={SUBTITULO_TIMBA}
        puedeElegir={puedeElegir}
        activa={activa}
        onElegir={onElegir}
        info={{ etiqueta: 'Ver juegos de Timba libre', onAbrir: () => setBanner(true) }}
      />
      <BannerTimba abierto={banner} onCerrar={() => setBanner(false)} proximamente={!puedeElegir} />
    </>
  )
}
