'use client'

import { useEffect } from 'react'
import { teeSugerido } from '@/golf/courses/tees-de-recorridos'
import type { CourseTee } from '@/lib/data/ronda-libre-nueva'
import type { RivalDelCreador } from './useFormularioDeRonda'

interface Args {
  /** Tees que publica la cancha elegida (vacío mientras carga o si no publica). */
  tees: CourseTee[]
  /** Recorridos elegidos en canchas de 27/36 hoyos. */
  recorridos: string[]
  teeGlobal: string
  onTeeGlobal: (tee: string) => void
  rivales: RivalDelCreador[]
  onTeeDeRival: (idx: number, tee: string) => void
}

/**
 * Mantiene cada tee elegido dentro de los que la cancha y la combinación de
 * recorridos ofrecen, SIN pisar una elección que sigue siendo válida.
 *
 * Antes la cancha imponía "blanco" cada vez que cargaba: repetir una ronda
 * desde azules la dejaba en blancos, y el creador sólo lo notaba en el
 * resumen (o no lo notaba, y jugaba con el slope equivocado). En canchas de 27
 * hoyos, cambiar de combinación dejaba un tee de OTRA combinación elegido.
 * Ahora sólo se corrige un tee que ya no existe, y se prefiere el mismo color.
 */
export function useTeesCoherentes({ tees, recorridos, teeGlobal, onTeeGlobal, rivales, onTeeDeRival }: Args) {
  useEffect(() => {
    const global = teeSugerido(tees, recorridos, teeGlobal)
    if (global && global !== teeGlobal) onTeeGlobal(global)

    rivales.forEach((rival, idx) => {
      // `null` = hereda el tee de la ronda: no hay nada que corregir.
      if (!rival.tees) return
      const propio = teeSugerido(tees, recorridos, rival.tees)
      if (propio && propio !== rival.tees) onTeeDeRival(idx, propio)
    })
    // Los callbacks son setters del formulario; incluirlos obligaría a
    // memoizarlos sin cambiar nada de lo que este efecto decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tees, recorridos, teeGlobal, rivales])
}
