'use client'

import type { CourseTee } from '@/lib/data/ronda-libre-nueva'
import { nombreOJugadorN } from '@/lib/nombre-de-jugador'
import type { RivalDelCreador } from '../hooks/useFormularioDeRonda'
import { usePlayerSearch, type SearchResult } from '../hooks/usePlayerSearch'
import { colores, etiqueta, hcpDeJugador, input, inputNumerico, inputQueBloquea } from './estilos'
import { SelectorDeTeeDelJugador } from './SelectorDeTeeDelJugador'
import { formatearHandicap, formatearIndice, MENSAJE_HANDICAP_OPCIONAL_NO_ES_NUMERO, PLACEHOLDER_CAMPO_HANDICAP_ANGOSTO } from '@/golf/handicap-index-range'
import { useCampoHandicap } from '@/hooks/useCampoHandicap'
import { AvisoCampo } from '@/components/ui/AvisoCampo'

interface Props {
  rival: RivalDelCreador
  indiceEnLista: number
  /** Número del jugador en pantalla (`numerosEnPantalla`): con él se nombra si no tiene nombre. */
  numeroEnPantalla: number
  tees: CourseTee[]
  teeGlobal: string
  golpes: number | null
  onCampo: <K extends keyof RivalDelCreador>(campo: K, valor: RivalDelCreador[K]) => void
  onQuitar: () => void
  /** El índice va a medio escribir o no es número: el paso no debe avanzar (ver useCampoHandicap). */
  onBloqueo: (bloquea: boolean) => void
}

/** Un rival del creador: tipo de cuenta, nombre, índice, tee y teléfono. */
export function TarjetaDeRival({ rival, indiceEnLista, numeroEnPantalla, tees, teeGlobal, golpes, onCampo, onQuitar, onBloqueo }: Props) {
  const idNombre = `rival-${indiceEnLista}-nombre`
  const idIndice = `rival-${indiceEnLista}-indice`
  // Texto local (#773): con type=number, "+1.5" quedaba en '' → 0 y un plus se veía "-2". El índice que llega
  // de un perfil elegido (handleSelect) reemplaza el texto.
  const campoIndice = useCampoHandicap(rival.handicap, v => onCampo('handicap', v), onBloqueo)

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
            Nombre del jugador {numeroEnPantalla}
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
            aria-label={`Quitar a ${nombreOJugadorN(rival.nombre, numeroEnPantalla)}`}
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
                    HCP {formatearIndice(profile.indice)}
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
                cursor: 'pointer', fontSize: '16px', padding: 0,
                minWidth: '44px', minHeight: '44px', marginRight: '-12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder={PLACEHOLDER_CAMPO_HANDICAP_ANGOSTO}
          value={campoIndice.texto}
          onChange={e => campoIndice.onTexto(e.target.value)}
          // Inválido o a medio escribir: el paso no avanza por este campo. "abc" tiene aviso propio; "+" a medio
          // escribir se explica en el aviso bajo el botón del paso, que nombra al jugador.
          aria-invalid={campoIndice.bloquea}
          aria-describedby={campoIndice.invalido
            ? `${idIndice}-error`
            : campoIndice.bloquea ? 'paso-jugadores-aviso' : undefined}
          style={{ ...input, ...inputNumerico, ...(campoIndice.bloquea ? inputQueBloquea : null) }}
        />
        <SelectorDeTeeDelJugador
          tees={tees}
          valor={rival.tees ?? teeGlobal}
          onElegir={t => onCampo('tees', t)}
          etiquetaAccesible={`Tee de ${nombreOJugadorN(rival.nombre, numeroEnPantalla)}`}
        />
        {golpes != null && (
          <span style={hcpDeJugador}>
            HCP {formatearHandicap(golpes)}
          </span>
        )}
      </div>
      {campoIndice.invalido && <AvisoCampo id={`${idIndice}-error`}>{MENSAJE_HANDICAP_OPCIONAL_NO_ES_NUMERO}</AvisoCampo>}

      {rival.tipo === 'invitado' && (
        <input
          type="tel"
          placeholder="Teléfono (WhatsApp, opcional)"
          aria-label={`Teléfono de ${nombreOJugadorN(rival.nombre, numeroEnPantalla)}`}
          value={rival.telefono}
          onChange={e => onCampo('telefono', e.target.value)}
          style={{ ...input, width: '100%', marginTop: '6px' }}
        />
      )}
    </div>
  )
}
