/**
 * Constantes para /perfil/historial.
 *
 * Extraídas del page.tsx monolítico durante el refactor 'el que toca, ordena'
 * (1329 LOC → componentes + hooks).
 */

import type { CSSProperties } from 'react'

export const CANCHAS_CHILE = [
  'Granadilla Golf Club', 'Club de Golf Los Leones', 'Club de Golf La Dehesa',
  'Club de Golf Marbella', 'Club de Golf Hacienda', 'Prince of Wales Country Club',
  'Club de Campo del Pacífico', 'Club de Golf Cachagua', 'Rocas de Santo Domingo Golf',
  'Club de Golf Concón', 'Club de Golf Viña del Mar', 'Club de Golf Quisco',
  'Club de Golf Valle Escondido', 'Club de Golf Papudo', 'Club de Golf Zapallar',
  'Club de Golf Algarrobo', 'Club de Golf Cartagena', 'Club de Golf Casablanca',
  'Los Arrayanes Golf Club', 'Club de Golf Pirque', 'Club de Golf Rancagua',
  'Club de Golf San Fernando', 'Club de Golf Talca', 'Club de Golf Chillán',
  'Club de Golf Concepción', 'Club de Golf Los Ángeles', 'Club de Golf Temuco',
  'Club de Golf Valdivia', 'Club de Golf Osorno', 'Club de Golf Puerto Montt',
  'Club de Golf Puerto Varas', 'Club de Golf Punta Arenas',
  'Club de Golf Antofagasta', 'Club de Golf Iquique', 'Club de Golf Arica',
  'Club de Golf La Serena', 'Club de Golf Copiapó', 'Club de Golf Ovalle',
  'Club de Golf Quilicura', 'Club de Golf Maipú', 'Club de Golf Pudahuel',
  'Club de Golf Peñalolén', 'Club de Golf Lo Barnechea', 'Club de Golf Vitacura',
  'Club de Golf Las Condes', 'Stgo. Country Club', 'Otra cancha',
] as const

export const TEES = ['Blanco', 'Amarillo', 'Azul', 'Rojo', 'Dorado', 'Negro', 'Verde', 'Naranja'] as const

export const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'] as const

export const THIS_YEAR = new Date().getFullYear()
export const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i)

export const TEE_COLORS: Record<string, string> = {
  Blanco: '#ffffff', Amarillo: '#fbbf24', Azul: '#3b82f6', Rojo: '#ef4444',
  Dorado: '#c4992a', Negro: '#111827', Verde: '#22c55e', Naranja: '#f97316',
}

export const inputBase: CSSProperties = {
  background:   'var(--input-bg)',
  border:       '1px solid var(--input-border)',
  color:        'var(--text)',
  borderRadius: '8px',
  padding:      '10px 12px',
  outline:      'none',
  width:        '100%',
  boxSizing:    'border-box' as const,
}

export const cardStyle: CSSProperties = {
  background: 'var(--bg-surface)',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  overflow: 'hidden',
}
