// Registro de direcciones visuales. Una pieza usa UNA dirección de principio a fin
// (guía de marca, 4.3: nunca mezclar dos direcciones).
import * as bloomberg from './bloomberg.mjs'

const DIRECCIONES = [bloomberg]

export const CLAVES = DIRECCIONES.map((d) => d.clave)

export function direccion(clave) {
  const d = DIRECCIONES.find((x) => x.clave === clave)
  if (!d) throw new Error(`Dirección visual desconocida: "${clave}". Hay: ${CLAVES.join(', ')}`)
  return d
}
