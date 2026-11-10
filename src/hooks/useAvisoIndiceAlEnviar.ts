'use client'
import { useState } from 'react'
import {
  avisoCampoHandicap,
  campoHandicapSePuedeEnviar,
  mensajeHandicapNoEsNumero,
  type ReglaCampoHandicap,
} from '@/golf/handicap-index-range'

/**
 * Un solo comportamiento para los campos de índice/hándicap de los formularios (registro, perfil, onboarding,
 * invitado del organizador, invitado por link): el botón de enviar NUNCA se apaga por el índice. Un botón
 * apagado sin aviso no dice qué falta (con "-" o "+" a medio escribir el formulario quedaba trabado).
 *
 * - Mientras se tipea: aviso en vivo solo si el texto no es número o (índice) está fuera de rango.
 * - Al enviar (`validarAlEnviar()`): si el campo no se puede enviar, se avisa en el campo, se le da el foco y
 *   devuelve false. El aviso del envío se va apenas se vuelve a escribir.
 *
 * `idCampo` es el id del input; el aviso va en `${idCampo}-error` (`idAviso`), enlazado con `propsDelCampo`.
 * Ronda libre no lo usa: ahí el paso entero no avanza (useCampoHandicap.bloquea), con el mismo predicado.
 */
export function useAvisoIndiceAlEnviar(texto: string, idCampo: string, regla: ReglaCampoHandicap) {
  const [avisarPorEnvio, setAvisarPorEnvio] = useState(false)
  const [textoPrevio, setTextoPrevio] = useState(texto)
  if (texto !== textoPrevio) {
    setTextoPrevio(texto)
    setAvisarPorEnvio(false)
  }

  const sePuedeEnviar = campoHandicapSePuedeEnviar(texto, regla)
  const aviso =
    avisoCampoHandicap(texto, regla) ??
    (avisarPorEnvio && !sePuedeEnviar ? mensajeHandicapNoEsNumero(regla.opcional) : null)
  const idAviso = `${idCampo}-error`

  const validarAlEnviar = (): boolean => {
    if (sePuedeEnviar) return true
    setAvisarPorEnvio(true)
    document.getElementById(idCampo)?.focus()
    return false
  }

  return {
    aviso,
    idAviso,
    sePuedeEnviar,
    validarAlEnviar,
    propsDelCampo: {
      'aria-invalid': aviso != null,
      'aria-describedby': aviso != null ? idAviso : undefined,
    },
  }
}
