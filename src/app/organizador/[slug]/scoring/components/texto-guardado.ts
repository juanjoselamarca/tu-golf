// Copy del estado de guardado de un hoyo en el scorer del organizador. Fuente única: la grilla, la tabla de
// stats y el chip de la cabecera dicen lo mismo con las mismas palabras.

import type { EstadoHoyo } from '../hooks/estado-hoyos'

/** Motivo corto de un rechazo (`LecturaSobre.rechazo`). */
export function textoMotivo(motivo: string | null): string {
  switch (motivo) {
    case 'closed': return 'tarjeta cerrada'
    case 'inactive': return 'el torneo no acepta scores'
    case 'sin_sesion': return 'tu sesión venció'
    case 'retirado': return 'jugador retirado'
    case 'datos': return 'dato no válido'
    default: return 'sin permiso'
  }
}

/** Rótulo corto del estado de un hoyo, o null si está guardado. */
export function rotuloEstado(estado: EstadoHoyo): string | null {
  if (estado === 'guardando') return 'Guardando'
  if (estado === 'sin_confirmar') return 'Sin confirmar'
  if (estado === 'rechazado') return 'No se guardó'
  return null
}
