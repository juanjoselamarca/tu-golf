// src/golf/courses/tees-de-recorridos.ts
//
// Tees de una cancha multi-recorrido (27/36 hoyos). El catálogo los nombra
// `<color>_<recorrido>_<recorrido>` ("blanco_norte_sur"), pero el ORDEN de los
// recorridos no es alfabético ni estable entre canchas: Las Rocas publica
// "blanco_roja_azul" y "blanco_azul_blanca", Las Brisas "azul_norte_este", y
// Marbella usa recorridos con espacio ("azul_andes pro_pacifico norte").
// Por eso un tee pertenece a la combinación si sus recorridos son el MISMO
// CONJUNTO que los elegidos, sin importar el orden.

/** Lo mínimo que se necesita de un tee para filtrarlo. */
interface TeeConNombre {
  nombre: string
}

/**
 * Tee que la app PRESELECCIONA cuando no hay uno elegido que siga siendo
 * válido. Distinto de `TEE_POR_DEFECTO` (`src/golf/ronda-libre/tee-del-jugador.ts`),
 * que sólo rescata al leer filas antiguas guardadas sin tee.
 */
export const TEE_SUGERIDO_POR_DEFECTO = 'blanco'

function normalizar(texto: string): string {
  return texto.trim().toLowerCase()
}

/** "blanco_norte_sur" → "blanco". Un tee sin recorridos se devuelve entero. */
export function colorDeTee(nombre: string): string {
  return normalizar(nombre).split('_')[0]
}

/**
 * ¿El tee es de esta combinación de recorridos? Sólo aplica con exactamente
 * dos recorridos elegidos; con otra cantidad no hay combinación que filtrar y
 * cualquier tee vale.
 */
export function teeEsDeLosRecorridos(nombre: string, recorridos: string[]): boolean {
  if (recorridos.length !== 2) return true
  const n = normalizar(nombre)
  const corte = n.indexOf('_')
  if (corte < 0) return false
  const resto = n.slice(corte + 1)
  const [a, b] = recorridos.map(normalizar)
  return resto === `${a}_${b}` || resto === `${b}_${a}`
}

/**
 * Tees de la combinación elegida. Si el catálogo no publica tees para ella se
 * devuelven todos: quedarse sin tees visibles dejaría al jugador sin poder
 * elegir desde dónde sale.
 */
export function teesDeLosRecorridos<T extends TeeConNombre>(tees: T[], recorridos: string[]): T[] {
  const filtrados = tees.filter(t => teeEsDeLosRecorridos(t.nombre, recorridos))
  return filtrados.length > 0 ? filtrados : tees
}

/**
 * Tee a dejar elegido cuando cambian los tees disponibles (otra cancha u otra
 * combinación de recorridos). En orden:
 *   1. el tee actual, si sigue disponible — nunca se pisa una elección válida;
 *   2. el mismo color en la nueva combinación — quien sale de azules sigue en azules;
 *   3. blanco; 4. el primero publicado.
 * Devuelve `null` si no hay tees (la cancha no publica ninguno): el caller
 * conserva lo que tenía.
 */
export function teeSugerido<T extends TeeConNombre>(
  tees: T[],
  recorridos: string[],
  teeActual: string | null | undefined,
): string | null {
  const disponibles = teesDeLosRecorridos(tees, recorridos)
  if (disponibles.length === 0) return null
  const nombres = disponibles.map(t => normalizar(t.nombre))

  const actual = teeActual ? normalizar(teeActual) : null
  if (actual && nombres.includes(actual)) return actual

  if (actual) {
    const mismoColor = nombres.find(n => colorDeTee(n) === colorDeTee(actual))
    if (mismoColor) return mismoColor
  }

  return nombres.find(n => colorDeTee(n) === TEE_SUGERIDO_POR_DEFECTO) ?? nombres[0]
}
