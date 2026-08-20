'use client'

import type { CourseTee } from '@/lib/data/ronda-libre-nueva'
import type { RivalDelCreador } from '../hooks/useFormularioDeRonda'
import { usePlayerSearch, type SearchResult } from '../hooks/usePlayerSearch'
import { colores, etiqueta, input } from './estilos'
import { SelectorDeTeeDelJugador } from './SelectorDeTeeDelJugador'

interface Props {
  rival: RivalDelCreador
  indiceEnLista: number
  tees: CourseTee[]
  teeGlobal: string
  golpes: number | null
  onCampo: <K extends keyof RivalDelCreador>(campo: K, valor: RivalDelCreador[K]) => void
  onQuitar: () => void
}

/** Un rival del creador: tipo de cuenta, nombre, índice, tee y teléfono. */
export function TarjetaDeRival({ rival, indiceEnLista, tees, teeGlobal, golpes, onCampo, onQuitar }: Props) {
  const idNombre = `rival-${indiceEnLista}-nombre`
  const idIndice = `rival-${indiceEnLista}-indice`

  // Search only active when tipo === 'cuenta' and no profile selected yet.
  const searchActive = rival.tipo === 'cuenta' && !rival.profileId
  const { results, searching, open, dismiss, containerRef } = usePlayerSearch(
    searchActive ? rival.nombre : '',
  )

  function handleSelect(profile: SearchResult) {
    onCampo('nombre', profile.name)
    onCampo('handicap', profile.indice)
    onCampo('profileId', profile.id)
    dismiss()
  }

  function handleNameChange(value: string) {
    onCampo('nombre', value)
    // If user edits name after selecting a profile, clear the link.
    if (rival.profileId) {
      onCampo('profileId', null)
    }
  }

  return (
    <div style={{
      marginBottom: '10px', background: colores.inputFondo,
      border: `1px solid ${colores.borde}`, borderRadius: '12px', padding: '12px',
    }}>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
        {(['cuenta', 'invitado'] as const).map(tipo => {
          const activo = rival.tipo === tipo
          return (
            <button
              key={tipo}
              type="button"
              aria-pressed={activo}
              onClick={() => {
                onCampo('tipo', tipo)
                // Clear profile link when switching to invitado.
                if (tipo === 'invitado' && rival.profileId) {
                  onCampo('profileId', null)
                }
              }}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: '8px', minHeight: '44px',
                fontSize: '13px', fontWeight: activo ? 600 : 400,
                background: activo ? 'rgba(196,153,42,0.15)' : 'transparent',
                color: activo ? colores.oroTexto : colores.texto2,
                border: `1px solid ${activo ? colores.oro : colores.borde}`,
                cursor: 'pointer',
              }}
            >
              {tipo === 'cuenta' ? 'Con cuenta' : 'Invitado'}
            </button>
          )
        })}
      </div>

      <div ref={containerRef} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
          <label htmlFor={idNombre} className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Nombre del jugador {indiceEnLista + 1}
          </label>
          <input
            id={idNombre}
            type="text"
            placeholder={rival.tipo === 'cuenta' ? 'Buscar jugador con cuenta...' : 'Nombre del invitado'}
            value={rival.nombre}
            onChange={e => handleNameChange(e.target.value)}
            autoComplete="off"
            style={{ ...input, flex: 1 }}
          />
          <button
            type="button"
            onClick={onQuitar}
            aria-label={`Quitar a ${rival.nombre.trim() || `jugador ${indiceEnLista + 1}`}`}
            style={{
              background: 'transparent', border: `1px solid ${colores.borde}`,
              color: colores.peligro, borderRadius: '10px', padding: '8px 12px',
              cursor: 'pointer', flexShrink: 0, fontSize: '16px',
              minHeight: '44px', minWidth: '44px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            &times;
          </button>
        </div>

        {/* Search dropdown */}
        {searchActive && open && (
          <div
            role="listbox"
            aria-label="Resultados de búsqueda"
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: 'var(--bg-surface)', border: `1px solid ${colores.borde}`,
              borderRadius: '10px', marginTop: '2px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              overflow: 'hidden',
            }}
          >
            {searching && results.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: '13px', color: colores.texto3 }}>
                Buscando...
              </div>
            )}
            {!searching && results.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: '13px', color: colores.texto3 }}>
                Sin resultados
              </div>
            )}
            {results.map(profile => (
              <button
                key={profile.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(profile)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '10px 14px', border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  fontSize: '14px', color: colores.texto, textAlign: 'left',
                  borderBottom: `1px solid ${colores.borde}`,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(196,153,42,0.06)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                <span style={{ fontWeight: 500 }}>{profile.name}</span>
                {profile.indice != null && (
                  <span style={{ fontSize: '12px', color: colores.texto3, marginLeft: '8px', flexShrink: 0 }}>
                    HCP {profile.indice.toFixed(1)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Linked profile badge */}
        {rival.profileId && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '11px', color: colores.ok, fontWeight: 500,
            marginBottom: '4px',
          }}>
            <span>Vinculado a cuenta Golfers+</span>
            <button
              type="button"
              onClick={() => onCampo('profileId', null)}
              aria-label="Desvincular perfil"
              style={{
                background: 'transparent', border: 'none', color: colores.texto3,
                cursor: 'pointer', fontSize: '11px', padding: '0 2px',
              }}
            >
              &times;
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor={idIndice} style={{ ...etiqueta, marginBottom: 0, fontSize: '12px', color: colores.texto3, flexShrink: 0 }}>
          Índice
        </label>
        <input
          id={idIndice}
          type="number"
          step="0.1"
          placeholder="Ej: 10.5"
          value={rival.handicap ?? ''}
          onChange={e => onCampo('handicap', e.target.value ? Number(e.target.value) : null)}
          style={{ ...input, width: '90px', minHeight: '38px', padding: '8px 12px', fontSize: '14px' }}
        />
        <SelectorDeTeeDelJugador
          tees={tees}
          valor={rival.tees ?? teeGlobal}
          onElegir={t => onCampo('tees', t)}
          etiquetaAccesible={`Tee de ${rival.nombre.trim() || `jugador ${indiceEnLista + 1}`}`}
        />
        {golpes != null && (
          <span style={{ fontSize: '12px', color: colores.oroTexto, fontWeight: 600 }}>
            HCP {golpes}
          </span>
        )}
      </div>

      {rival.tipo === 'invitado' && (
        <input
          type="tel"
          placeholder="Telefono (WhatsApp, opcional)"
          aria-label={`Telefono de ${rival.nombre.trim() || `jugador ${indiceEnLista + 1}`}`}
          value={rival.telefono}
          onChange={e => onCampo('telefono', e.target.value)}
          style={{ ...input, width: '100%', marginTop: '6px' }}
        />
      )}
    </div>
  )
}
