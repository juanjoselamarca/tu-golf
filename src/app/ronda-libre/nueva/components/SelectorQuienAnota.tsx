'use client'

import { colores, etiqueta, opcion } from './estilos'

interface Props {
  anotaPorTodos: boolean
  onElegir: (porTodos: boolean) => void
}

const OPCIONES = [
  { porTodos: false, titulo: 'Cada uno en su celular', desc: 'Cada jugador lleva su tarjeta' },
  { porTodos: true, titulo: 'Yo anoto por todos', desc: 'Tú marcas el score del grupo' },
] as const

/**
 * "¿Quién anota?", sólo en los formatos que no lo deciden solos (Stroke Play).
 * Antes era el paso 1 del asistente, antes de saber qué se iba a jugar, y
 * elegir un formato de equipo después la contestaba a espaldas del usuario.
 */
export function SelectorQuienAnota({ anotaPorTodos, onElegir }: Props) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ ...etiqueta, marginBottom: '10px' }}>¿Quién anota?</div>
      <div style={{ display: 'flex', gap: '10px' }}>
        {OPCIONES.map(op => {
          const activo = anotaPorTodos === op.porTodos
          return (
            <button
              key={op.titulo}
              type="button"
              aria-pressed={activo}
              onClick={() => onElegir(op.porTodos)}
              style={{ ...opcion(activo), flex: 1, padding: '14px' }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto, marginBottom: '2px' }}>
                {op.titulo}
              </div>
              <div style={{ fontSize: '11px', color: colores.texto2 }}>{op.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
