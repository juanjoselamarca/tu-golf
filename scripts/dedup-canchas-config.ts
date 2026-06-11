/**
 * Config del dedup de canchas: los 3 clusters de duplicado real EN USO.
 * UUIDs verificados contra prod 2026-06-10 (ver spec §2 y diagnóstico de sesión):
 *   - manual (genero_norm='X', canónica que GANA) + fedegolf V/D (se redirigen).
 *   - Solo Los Leones VARONES (b1b6ba60) tiene 1 ronda; el resto de fedegolf, 0.
 */
export interface Cluster {
  slug: string
  nombre: string
  /** Ficha manual mixta = canónica (gana). */
  manualId: string
  /** Fichas fedegolf V/D → se redirigen (canonical_course_id=manual) + activa=false. */
  fedegolfIds: string[]
}

export const CLUSTERS: Cluster[] = [
  {
    slug: 'los-leones', nombre: 'Los Leones',
    manualId: '8f64cd3a-daed-4d97-98e9-7f8ef9552f2d',
    fedegolfIds: ['b1b6ba60-18f0-48a8-97c2-ef10e25fbe26', '348ce623-f548-4605-b050-5f8d1e02981b'],
  },
  {
    slug: 'la-dehesa', nombre: 'La Dehesa',
    manualId: '8fb8c2ce-a8ec-4938-bc05-e77e2dcb2281',
    fedegolfIds: ['01a0ec3f-5ce9-4eb8-8c40-f4e481ec871a', '785378dc-ec4f-4252-8e99-3b6a70e7a001'],
  },
  {
    slug: 'lomas', nombre: 'Lomas de La Dehesa',
    manualId: 'dff847e1-34d9-4805-85a7-01ec3e554f65',
    fedegolfIds: ['b4bca060-49db-4a2a-924c-862754854a20', 'f076395b-0e08-453b-843e-ac1dbfa12af6'],
  },
]
