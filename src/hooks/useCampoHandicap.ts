'use client'
import { useState } from 'react'
import { leerCampoHandicap, textoCampoHandicap } from '@/golf/handicap-index-range'

/**
 * Campo de hándicap tipeado cuyo valor vive en el padre como número (`number | null`).
 *
 * El texto es local: un `type="number"` con `value={valor}` no deja escribir "+2" (el navegador entrega '')
 * ni "18,5", y un plus guardado se veía "-2". Aquí el texto se precarga con `textoCampoHandicap` ("+2") y lo
 * tipeado se lee con `leerCampoHandicap`. Al padre le llega el número si el texto es un número, y `null` si
 * está vacío, a medio escribir o inválido: así lo que se calcula con ese valor (los golpes) nunca contradice
 * lo que dice el campo. `invalido` es para el aviso.
 *
 * Si el padre cambia el valor desde afuera (llega el índice del perfil), el texto se reemplaza, salvo que ya
 * diga ese mismo número (no se le pisa "12." a quien está escribiendo 12.5).
 */
export function useCampoHandicap(valor: number | null, onValor: (v: number | null) => void) {
  const [texto, setTexto] = useState(() => textoCampoHandicap(valor))
  const [valorPrevio, setValorPrevio] = useState(valor)
  if (valor !== valorPrevio) {
    setValorPrevio(valor)
    if (leerCampoHandicap(texto).valor !== valor) setTexto(textoCampoHandicap(valor))
  }

  const onTexto = (nuevo: string) => {
    setTexto(nuevo)
    onValor(leerCampoHandicap(nuevo).valor)
  }

  return { texto, onTexto, invalido: leerCampoHandicap(texto).estado === 'invalido' }
}
