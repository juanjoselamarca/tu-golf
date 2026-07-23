/* eslint-disable @next/next/no-img-element */
// src/app/torneo/[slug]/components/TournamentHeader.tsx
//
// Header del torneo público: foto de portada (opcional) + <TorneoHeader> (fuente
// única de la identidad visual del torneo, compartida con /en-vivo y scoring) +
// código de inscripción. Antes tenía su propia maqueta serif + pill + un wordmark
// "Golfers +" redundante con el navbar; ahora delega en TorneoHeader.
// El botón "Modo TV" se removió del header público (decisión Juanjo inbox
// 35f4ee89, may-27); la ruta /torneo/[slug]/tv sigue accesible por URL.

import { TorneoHeader } from '@/components/torneo/TorneoHeader'

export interface TournamentHeaderProps {
  tournamentName: string
  courseName: string | null
  totalHoyos: number
  /** Clave de formato (formato_juego); el label lo resuelve TorneoHeader. */
  format: string
  modo: 'gross' | 'neto'
  /** Estado crudo del torneo (draft|open|in_progress|closed|published). */
  status: string | null
  /** "En vivo" con noción de fecha (torneoEnVivo) — decide navy vs claro. */
  live: boolean
  dateDisplay: string
  coverImageUrl: string | null
  codigo: string | null
}

export function TournamentHeader(props: TournamentHeaderProps) {
  const { tournamentName, courseName, totalHoyos, format, modo, status, live, dateDisplay, coverImageUrl, codigo } = props

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '16px 16px 0' }}>
      {coverImageUrl && (
        <img
          src={coverImageUrl}
          alt={`Portada de ${tournamentName}`}
          width={1600}
          height={900}
          loading="eager"
          style={{
            width: '100%',
            height: 'auto',
            aspectRatio: '16 / 9',
            objectFit: 'cover',
            borderRadius: '16px',
            display: 'block',
            background: '#e5e7eb',
            marginBottom: '16px',
          }}
        />
      )}

      <TorneoHeader
        name={tournamentName}
        format={format}
        modo={modo}
        status={status}
        live={live}
        courseName={courseName}
        holeCount={totalHoyos}
        dateStr={dateDisplay}
        audience="player"
      />

      {codigo && (
        <div style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '8px', padding: '6px 12px' }}>
          <span style={{ fontFamily: "var(--font-dm-sans, 'DM Sans', system-ui, sans-serif)", fontSize: '12px', color: 'var(--text-3, #94a3b8)' }}>Únete con</span>
          <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '14px', color: 'var(--brand-gold, #c4992a)', fontWeight: 700, letterSpacing: '0.1em' }}>{codigo}</span>
        </div>
      )}
    </div>
  )
}
