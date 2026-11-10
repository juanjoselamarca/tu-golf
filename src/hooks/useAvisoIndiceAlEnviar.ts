'use client'
import {
  avisoCampoHandicap,
  campoHandicapSePuedeEnviar,
  mensajeHandicapNoEsNumero,
  type ReglaCampoHandicap,
} from '@/golf/handicap-index-range'
import { useAvisoDeCampo } from './useAvisoDeCampo'

/**
 * Un solo comportamiento para los campos de índice/hándicap de los formularios (registro, perfil, onboarding,
 * invitado del organizador, invitado por link): el botón de enviar NUNCA se apaga por el índice. Un botón
 * apagado sin aviso no dice qué falta (con "-" o "+" a medio escribir el formulario quedaba trabado).
 *
 * - Mientras se tipea: aviso en vivo solo si el texto no es número o (índice) está fuera de rango.
 * - Al enviar (`validarAlEnviar()`): si el campo no se puede enviar (vacío o número, salvo un obligatorio
 *   vacío), se avisa en el campo, se le da el foco y devuelve false.
 * - `avisar(mensaje)`: para lo que pasa después de enviar (el UPDATE falló), en el mismo lugar.
 * Los avisos del envío se van apenas se vuelve a escribir.
 *
 * `idCampo` es el id del input; el aviso va en `${idCampo}-error` (`idAviso`), enlazado con `propsDelCampo`.
 * Ronda libre no lo usa: ahí el paso entero no avanza (useCampoHandicap.bloquea), con el mismo predicado.
 */
export function useAvisoIndiceAlEnviar(texto: string, idCampo: string, regla: ReglaCampoHandicap) {
  const campo = useAvisoDeCampo(texto, idCampo)
  const sePuedeEnviar = campoHandicapSePuedeEnviar(texto, regla)
  const aviso = avisoCampoHandicap(texto, regla) ?? campo.avisoDelEnvio

  const validarAlEnviar = (): boolean => {
    if (sePuedeEnviar) return true
    campo.avisar(mensajeHandicapNoEsNumero(regla.opcional))
    return false
  }

  return {
    aviso,
    idAviso: campo.idAviso,
    sePuedeEnviar,
    validarAlEnviar,
    avisar: campo.avisar,
    propsDelCampo: {
      'aria-invalid': aviso != null,
      'aria-describedby': aviso != null ? campo.idAviso : undefined,
    },
  }
}
