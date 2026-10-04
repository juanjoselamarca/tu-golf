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
