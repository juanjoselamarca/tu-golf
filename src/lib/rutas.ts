/**
 * FUENTE ÚNICA de "¿esta ruta es una pantalla de anotar golpes?".
 *
 * Scorers: `/ronda-libre/X/score`, `/ronda-libre/X/score-grupo`, `/torneo/X/score`,
 * `/organizador/X/scoring`. En ellas no se superpone nada a la barra inferior del
 * scorer (Anterior / Siguiente / Finalizar): se usa en cancha, con una mano y apuro.
 *
 * `src/components/Navbar.tsx` (archivo protegido) mantiene su copia inline del mismo
 * criterio; se migra cuando se toque con el protocolo de archivos protegidos.
 */
export function esRutaDeScoring(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname.includes('/score') || pathname.includes('/scoring'))
}

/**
 * Donde el jugador agrega o corrige su índice oficial (`profiles.indice`): /perfil
 * abre el formulario de edición y lleva el foco al campo del índice. Lo usa el CTA
 * "Agrega tu índice" de las pantallas que muestran el índice (`indiceVisible`).
 */
export const PARAM_EDITAR_INDICE = { clave: 'editar', valor: 'indice' } as const
export const RUTA_EDITAR_INDICE = `/perfil?${PARAM_EDITAR_INDICE.clave}=${PARAM_EDITAR_INDICE.valor}`
