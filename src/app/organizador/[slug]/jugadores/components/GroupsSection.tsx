'use client'

import { inputStyle } from '../styles'
import type { TournamentGroup } from '../types'

interface Props {
  tournamentStatus: string
  groups: TournamentGroup[]
  newGroupName: string
  setNewGroupName: (v: string) => void
  newGroupTeeTime: string
  setNewGroupTeeTime: (v: string) => void
  creatingGroup: boolean
  onCreateGroup: () => void
  teeStartTime: string
  setTeeStartTime: (v: string) => void
  teeInterval: number
  setTeeInterval: (v: number) => void
  generatingTees: boolean
  onGenerateTeeTimes: () => void
  onDeleteGroup: (groupId: string) => void
  /** En formatos de equipo (scramble/best ball/foursome), el grupo ES el
   *  equipo: la sección se re-etiqueta y valida el tamaño esperado. */
  isTeam: boolean
  teamSize: number
}

/** Sección de grupos de salida: crear grupo, generar horarios, cards de grupo.
 *  Extraído verbatim de JugadoresPanel. */
export function GroupsSection({
  tournamentStatus, groups,
  newGroupName, setNewGroupName, newGroupTeeTime, setNewGroupTeeTime,
  creatingGroup, onCreateGroup,
  teeStartTime, setTeeStartTime, teeInterval, setTeeInterval,
  generatingTees, onGenerateTeeTimes, onDeleteGroup,
  isTeam, teamSize,
}: Props) {
  const noun = isTeam ? 'equipo' : 'grupo'
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-card)',
        padding: '28px',
        marginBottom: '32px',
      }}
    >
      <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', margin: isTeam ? '0 0 6px' : '0 0 20px' }}>
        {isTeam ? `Equipos (${groups.length})` : `Grupos de salida (${groups.length})`}
      </h2>
      {isTeam && (
        <div style={{ fontSize: '13px', color: 'var(--text-2)', margin: '0 0 20px' }}>
          Cada grupo es un equipo. Arma equipos de {teamSize} jugador{teamSize !== 1 ? 'es' : ''} y asigná cada jugador desde la tabla de abajo.
        </div>
      )}

      {/* Create group form */}
      {tournamentStatus === 'draft' && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Nombre del {noun}</label>
            <input
              type="text"
              placeholder={isTeam ? 'Ej: Equipo 1' : 'Ej: Grupo 1'}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '0 1 160px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Hora de salida (opc.)</label>
            <input
              type="time"
              value={newGroupTeeTime}
              onChange={(e) => setNewGroupTeeTime(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            onClick={onCreateGroup}
            disabled={creatingGroup || !newGroupName.trim()}
            style={{
              background: '#1a4fd6',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              cursor: creatingGroup || !newGroupName.trim() ? 'not-allowed' : 'pointer',
              opacity: creatingGroup || !newGroupName.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {creatingGroup ? '...' : `Crear ${noun}`}
          </button>
        </div>
      )}

      {/* Generate tee times */}
      {tournamentStatus === 'draft' && groups.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px', padding: '16px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Hora inicio</label>
            <input
              type="time"
              value={teeStartTime}
              onChange={(e) => setTeeStartTime(e.target.value)}
              style={{ ...inputStyle, width: '120px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Intervalo (min)</label>
            <input
              type="number"
              value={teeInterval}
              onChange={(e) => setTeeInterval(Math.max(1, parseInt(e.target.value) || 10))}
              min={1}
              max={30}
              style={{ ...inputStyle, width: '80px' }}
            />
          </div>
          <button
            type="button"
            onClick={onGenerateTeeTimes}
            disabled={generatingTees}
            style={{
              background: 'rgba(196,153,42,0.15)',
              border: '1px solid var(--border-md)',
              color: 'var(--brand-on-bg)',
              fontWeight: 600,
              fontSize: '13px',
              padding: '10px 16px',
              borderRadius: '8px',
              cursor: generatingTees ? 'not-allowed' : 'pointer',
              opacity: generatingTees ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {generatingTees ? 'Generando...' : `Generar horarios (${groups.length} grupos)`}
          </button>
        </div>
      )}

      {/* Group cards */}
      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-2)', fontSize: '13px' }}>
          {isTeam ? `Sin equipos aún. Crea equipos de ${teamSize} y asigna jugadores.` : 'Sin grupos aún. Crea grupos y asigna jugadores.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {groups.map((g) => (
            <div
              key={g.id}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border-md)',
                borderRadius: '10px',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                  {g.name}
                  {isTeam && (
                    <span
                      title={g.players.length === teamSize ? 'Equipo completo' : `Debería tener ${teamSize} jugadores`}
                      style={{
                        fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '10px',
                        background: g.players.length === teamSize ? 'rgba(34,197,94,0.15)' : 'rgba(196,153,42,0.15)',
                        color: g.players.length === teamSize ? '#22c55e' : 'var(--brand-on-bg)',
                        border: `1px solid ${g.players.length === teamSize ? 'rgba(34,197,94,0.3)' : 'var(--border-md)'}`,
                      }}
                    >
                      {g.players.length}/{teamSize}
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {g.tee_time && (
                    <span style={{ fontSize: '12px', color: 'var(--brand-on-bg)', fontFamily: 'monospace' }}>
                      {g.tee_time.includes('T') ? new Date(g.tee_time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : g.tee_time}
                    </span>
                  )}
                  {tournamentStatus === 'draft' && (
                    <button
                      onClick={() => onDeleteGroup(g.id)}
                      style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}
                    >
                      X
                    </button>
                  )}
                </div>
              </div>
              {g.players.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-2)', fontStyle: 'italic' }}>Sin jugadores</div>
              ) : (
                g.players.map((gp) => (
                  <div key={gp.id} style={{ fontSize: '13px', color: 'var(--text)', padding: '4px 0', borderTop: '1px solid var(--border)' }}>
                    {gp.playerName}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
