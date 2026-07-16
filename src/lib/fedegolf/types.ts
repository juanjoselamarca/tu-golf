/**
 * Tipos e interfaces para la integración con fedegolf.cl
 * Fuente: reverse-engineering de la API de la Federación Chilena de Golf
 */

// ─── Sesión ──────────────────────────────────────────────────────────

export interface FedegolfSession {
  cookie: string // PHPSESSID=...
  /**
   * Datos del socio devueltos por el login (nombre, género, etc.). Presente
   * cuando la sesión se obtuvo con credenciales frescas; ausente si solo se
   * reusó una cookie. Se usa para autocompletar el perfil al vincular.
   */
  perfil?: FedegolfPerfil
}

/**
 * Subconjunto útil del perfil del socio que expone fedegolf.cl en la respuesta
 * del login. Solo mapeamos lo que la app puede consumir hoy (name + genero).
 */
export interface FedegolfPerfil {
  usuarioId: number | null
  nombreCompleto: string | null
  /** Género normalizado a la convención de la app: 'M' | 'F' (o null si no se pudo mapear). */
  genero: 'M' | 'F' | null
  /** Valor crudo de `sexo` que vino de FedeGolf (ej. "Varon", "Dama"), para trazabilidad. */
  sexoRaw: string | null
  /**
   * Fecha de nacimiento del socio en formato ISO `YYYY-MM-DD`, o null si FedeGolf
   * no la trae o viene malformada. Se persiste en `profiles.fecha_nacimiento`
   * (fill-if-null) para habilitar edad → tees senior / segmentación por edad.
   */
  fechaNacimiento: string | null
}

// ─── Login ───────────────────────────────────────────────────────────

export interface FedegolfLoginRequest {
  rut: string
  password: string
}

export interface FedegolfLoginResponse {
  status: number
  userData?: Record<string, unknown>
}

// ─── Canchas ─────────────────────────────────────────────────────────

export interface FedegolfCancha {
  cancha: string // ID numérico como string
  nombre: string
}

// ─── Info de cancha (slope/rating por tee) ───────────────────────────

/** Colores de tee que maneja fedegolf.cl */
export type FedegolfTeeColor = 'azul' | 'blanco' | 'rojo' | 'negro' | 'rojov'

/** Nombre legible para cada tee (rojov = dorado) */
export const FEDEGOLF_TEE_LABELS: Record<FedegolfTeeColor, string> = {
  azul: 'Azul',
  blanco: 'Blanco',
  rojo: 'Rojo',
  negro: 'Negro',
  rojov: 'Dorado',
}

export interface FedegolfTeeInfo {
  color: FedegolfTeeColor
  label: string
  rating: number
  slope: number
  active: boolean // checked="checked" en el HTML
}

export interface FedegolfInfoCancha {
  nombre: string
  par: number
  genero: 'masculino' | 'femenino' | null
  tees: FedegolfTeeInfo[]
  raw: Record<string, string> // respuesta cruda del servidor
}

// ─── Índice de jugador ───────────────────────────────────────────────

export interface FedegolfIndice {
  rut: string
  indice: number | null // null si no se encontró
}

// ─── Miembros de club ────────────────────────────────────────────────

export interface FedegolfMiembro {
  value: string // ID interno
  nombre: string
  apellidoPat: string
  apellidoMat: string
}

// ─── Club ────────────────────────────────────────────────────────────

export interface FedegolfClub {
  id: number
  nombre: string
}

// ─── Descarga masiva ─────────────────────────────────────────────────

export interface FedegolfCourseData {
  club: FedegolfClub
  canchas: (FedegolfCancha & { info: FedegolfInfoCancha | null })[]
}

export type FedegolfDownloadProgress = {
  phase: 'canchas' | 'info'
  clubIndex: number
  totalClubs: number
  clubName: string
  canchaIndex?: number
  totalCanchas?: number
}

// ─── Catálogo de clubes federados ────────────────────────────────────

export const FEDEGOLF_CLUBES: FedegolfClub[] = [
  { id: 31, nombre: 'A.A. Antofagasta' },
  { id: 72, nombre: 'C.C. Bellavista' },
  { id: 41, nombre: 'C.C. Coya' },
  { id: 18, nombre: 'C.C. Granadilla' },
  { id: 43, nombre: 'C.C. La Posada' },
  { id: 49, nombre: 'C.C. Osorno' },
  { id: 23, nombre: 'C.C. Pan De Azucar' },
  { id: 51, nombre: 'C.G. 7 Rios' },
  { id: 57, nombre: 'C.G. Angostura' },
  { id: 79, nombre: 'C.G. Bahia Coique' },
  { id: 36, nombre: 'C.G. Barquito Chanaral' },
  { id: 21, nombre: 'C.G. Cachagua' },
  { id: 27, nombre: 'C.G. Costa Cachagua' },
  { id: 50, nombre: 'C.G. El Alba' },
  { id: 26, nombre: 'C.G. Huinganal' },
  { id: 3, nombre: 'C.G. La Dehesa' },
  { id: 24, nombre: 'C.G. La Serena' },
  { id: 12, nombre: 'C.G. Las Araucarias' },
  { id: 6, nombre: 'C.G. Las Brisas De Chicureo' },
  { id: 16, nombre: 'C.G. Las Brisas De Santo Domingo' },
  { id: 7, nombre: 'C.G. Lomas De La Dehesa' },
  { id: 5, nombre: 'C.G. Los Leones' },
  { id: 14, nombre: 'C.G. Los Lirios Rancagua' },
  { id: 58, nombre: 'C.G. Mapocho' },
  { id: 25, nombre: 'C.G. Papudo' },
  { id: 53, nombre: 'C.G. Rinconada De Chillan' },
  { id: 28, nombre: 'C.G. Rio Blanco' },
  { id: 33, nombre: 'C.G. Rio Lluta' },
  { id: 38, nombre: 'C.G. Rio Loa' },
  { id: 17, nombre: 'C.G. Rocas De Santo Domingo' },
  { id: 22, nombre: 'C.G. Santa Augusta' },
  { id: 2, nombre: 'C.G. Sport Frances' },
  { id: 37, nombre: 'C.G. Tocopilla' },
  { id: 8, nombre: 'C.G. Valle Escondido' },
  { id: 56, nombre: 'C.G.P. El Principal' },
  { id: 19, nombre: 'C.N.C. Las Salinas' },
  { id: 44, nombre: 'C.N.C. Tumbes' },
  { id: 15, nombre: 'Cancha Internacional' },
  { id: 1, nombre: 'Club De Polo y Equitacion S.C.' },
  { id: 9, nombre: 'Hacienda Chicureo C.G.' },
  { id: 10, nombre: 'Hacienda Santa Martina' },
  { id: 35, nombre: 'Iquique C.C.' },
  { id: 54, nombre: 'Magallanes G.C.' },
  { id: 20, nombre: 'Marbella C.C.' },
  { id: 30, nombre: 'Marina Golf Rapel' },
  { id: 75, nombre: 'Nevados de Villarica' },
  { id: 46, nombre: 'Nueva Frontera C.C.' },
  { id: 73, nombre: 'Patagonia Virgin Frutillar' },
  { id: 4, nombre: 'Prince Of Wales C.C.' },
  { id: 34, nombre: 'Quinteros Golf C.C.' },
  { id: 42, nombre: 'Talca C.C.' },
  { id: 48, nombre: 'Valdivia G.C.' },
]
