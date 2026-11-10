'use client'
import { useEffect, useEffectEvent, useState } from 'react'
import { campoHandicapEnviable, leerCampoHandicap, textoCampoHandicap } from '@/golf/handicap-index-range'

/**
 * Campo de hándicap tipeado cuyo valor vive en el padre como número (`number | null`).
 *
 * El texto es local: un `type="number"` con `value={valor}` no deja escribir "+2" (el navegador entrega '')
 * ni "18,5", y un plus guardado se veía "-2". Aquí el texto se precarga con `textoCampoHandicap` ("+2") y lo
 * tipeado se lee con `leerCampoHandicap`. Al padre le llega el número si el texto es un número, y `null` si
 * está vacío, a medio escribir o inválido: así lo que se calcula con ese valor (los golpes) nunca contradice
 * lo que dice el campo. `invalido` es para el aviso; `bloquea` (a medio escribir o inválido, lo contrario de
 * `campoHandicapEnviable`) es lo que el padre usa para no avanzar. Como el `null` que le llega al padre no
 * distingue "vacío" de "abc", el hook le avisa con `onBloquea(true/false)`, también al desmontarse (un rival
 * que se quita no deja el formulario trabado). Lo usa la ronda libre, con varias tarjetas en un paso; los
 * formularios de un solo campo usan `useAvisoIndiceAlEnviar`, que no apaga el botón y avisa al enviar.
 *
 * Si el padre cambia el valor desde afuera (llega el índice del perfil), el texto se reemplaza, salvo que ya
 * diga ese mismo número (no se le pisa "12." a quien está escribiendo 12.5).
 */
export function useCampoHandicap(
  valor: number | null,
  onValor: (v: number | null) => void,
  onBloquea?: (bloquea: boolean) => void,
) {
  const [texto, setTexto] = useState(() => textoCampoHandicap(valor))
  const [valorPrevio, setValorPrevio] = useState(valor)
  // Object.is y no !==: con NaN, `NaN !== NaN` es siempre true y el setState en render no terminaba nunca.
  if (!Object.is(valor, valorPrevio)) {
    setValorPrevio(valor)
    if (!Object.is(leerCampoHandicap(texto).valor, valor)) setTexto(textoCampoHandicap(valor))
  }

  const bloquea = !campoHandicapEnviable(texto)
  const avisarBloqueo = useEffectEvent((b: boolean) => onBloquea?.(b))
  useEffect(() => {
    if (!bloquea) return
    avisarBloqueo(true)
    return () => avisarBloqueo(false)
  }, [bloquea])

  const onTexto = (nuevo: string) => {
    setTexto(nuevo)
    onValor(leerCampoHandicap(nuevo).valor)
  }

  return { texto, onTexto, invalido: leerCampoHandicap(texto).estado === 'invalido', bloquea }
}
