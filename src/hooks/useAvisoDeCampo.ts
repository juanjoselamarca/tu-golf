'use client'
import { useState } from 'react'

/**
 * Aviso que deja el envío de un formulario en UN campo (el nombre del invitado, el índice): se muestra en
 * `${idCampo}-error`, el campo recibe el foco y el aviso se va apenas se vuelve a escribir. Es la base de
 * useAvisoIndiceAlEnviar; sirve igual para un campo que no es de hándicap.
 */
export function useAvisoDeCampo(texto: string, idCampo: string) {
  const [avisoDelEnvio, setAvisoDelEnvio] = useState<string | null>(null)
  const [textoPrevio, setTextoPrevio] = useState(texto)
  if (texto !== textoPrevio) {
    setTextoPrevio(texto)
    setAvisoDelEnvio(null)
  }
  const idAviso = `${idCampo}-error`

  const avisar = (mensaje: string) => {
    setAvisoDelEnvio(mensaje)
    document.getElementById(idCampo)?.focus()
  }

  return {
    avisoDelEnvio,
    idAviso,
    avisar,
    propsDelCampo: {
      'aria-invalid': avisoDelEnvio != null,
      'aria-describedby': avisoDelEnvio != null ? idAviso : undefined,
    },
  }
}
