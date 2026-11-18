// Copy del estado de guardado de un hoyo en el scorer del organizador. Fuente única: la grilla, la tabla de
// stats y el chip de la cabecera dicen lo mismo con las mismas palabras.

import type { EstadoHoyo, Pendiente, VistaHoyo } from '../hooks/estado-hoyos'
import type { EstadoCierre } from '../hooks/useCerrarTarjeta'

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

/** Aviso de un hoyo que no está guardado, con su motivo si fue rechazado. Grilla y tabla de stats. */
export function textoAvisoHoyo(hole: number, v: Pick<VistaHoyo, 'estado' | 'motivo'>): string {
  const rotulo = rotuloEstado(v.estado)?.toLowerCase() ?? ''
  return `Hoyo ${hole}: ${rotulo}${v.estado === 'rechazado' ? ` (${textoMotivo(v.motivo)})` : ''}`
}

/**
 * Salida de un rechazo que NO se descarta (sesión vencida, sin permiso): qué hacer para que se guarde.
 * null para el resto (se reintenta o se descarta).
 */
export function textoSalidaRechazo(motivo: string | null): string | null {
  if (motivo === 'sin_sesion') return 'Entra de nuevo en otra pestaña (aquí no se pierde lo anotado) y toca Reintentar.'
  if (motivo === 'sin_permiso') return 'Revisa que sigas como organizador del torneo y toca Reintentar.'
  return null
}

/**
 * Aviso de un grupo de hoyos en el mismo estado (y motivo): UN aviso para todos, no uno por hoyo.
 * "Hoyos 3, 4, 7 sin confirmar" · "Hoyo 5 no se guardó (tarjeta cerrada)".
 */
export function textoAvisoGrupo(holes: readonly number[], estado: 'sin_confirmar' | 'rechazado', motivo: string | null): string {
  const uno = holes.length === 1
  const cuales = `${uno ? 'Hoyo' : 'Hoyos'} ${holes.join(', ')}`
  if (estado === 'sin_confirmar') return `${cuales} sin confirmar`
  return `${cuales} no se ${uno ? 'guardó' : 'guardaron'} (${textoMotivo(motivo)})`
}

const hoyos = (n: number) => (n === 1 ? '1 hoyo' : `${n} hoyos`)

/**
 * Chip global de la cabecera: hoyos sin confirmar o rechazados de CUALQUIER tarjeta (lo que está saliendo no se
 * cuenta). Con nombre cuando son de otra tarjeta que la abierta: el organizador ya pasó a otro jugador.
 */
export function textoChipPendientes(
  pendientes: readonly Pendiente[],
  rondaAbierta: string | null,
  nombreDeRonda: (roundId: string) => string | null,
): string | null {
  const sinConfirmar = pendientes.filter((p) => p.estado === 'sin_confirmar')
  const rechazados = pendientes.filter((p) => p.estado === 'rechazado')
  if (sinConfirmar.length === 0 && rechazados.length === 0) return null
  const partes: string[] = []
  if (sinConfirmar.length > 0) partes.push(`Sin señal: ${hoyos(sinConfirmar.length)} sin confirmar`)
  if (rechazados.length > 0) partes.push(`${hoyos(rechazados.length)} no se ${rechazados.length === 1 ? 'guardó' : 'guardaron'}`)
  const otros = [...new Set([...sinConfirmar, ...rechazados].map((p) => p.roundId).filter((r) => r !== rondaAbierta))]
    .map(nombreDeRonda)
    .filter((n): n is string => !!n)
  return partes.join(' · ') + (otros.length > 0 ? ` (${otros.join(', ')})` : '')
}

/** Tarjetas no abiertas con hoyos para descartar: "Ana: hoyos 3, 4 · Beto: hoyo 2". */
export function textoDescartablesOtras(lista: ReadonlyArray<{ nombre: string | null; holes: readonly number[] }>): string {
  return lista
    .map(({ nombre, holes }) => `${nombre ?? 'Otra tarjeta'}: ${holes.length === 1 ? 'hoyo' : 'hoyos'} ${holes.join(', ')}`)
    .join(' · ')
}

/** Botón Finalizar: qué está pasando con el cierre (de esta tarjeta o de otra que se está cerrando). */
export function textoBotonCierre(cierre: EstadoCierre | null, deEstaTarjeta: boolean): string {
  if (!cierre) return 'Finalizar ronda ✓'
  if (!deEstaTarjeta) return `Cerrando tarjeta de ${cierre.nombre}…`
  if (cierre.fase === 'cerrando') return 'Cerrando tarjeta…'
  if (cierre.hoyos.length === 0) return 'Terminando de guardar…'
  return `Terminando de guardar… ${cierre.hoyos.length === 1 ? 'hoyo' : 'hoyos'} ${cierre.hoyos.join(', ')}`
}
