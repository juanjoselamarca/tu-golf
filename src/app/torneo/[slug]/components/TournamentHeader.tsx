/* eslint-disable @next/next/no-img-element */
// src/app/torneo/[slug]/components/TournamentHeader.tsx
//
// Header del torneo publico: foto de portada (opcional) con nombre overlayed +
// <TorneoHeader> (fuente unica de la identidad visual del torneo, compartida con
// /en-vivo y scoring) + codigo de inscripcion.

import { TorneoHeader } from '@/components/torneo/TorneoHeader'
import { TournamentShareButton } from './TournamentShareButton'

export interface TournamentHeaderProps {
  tournamentName: string
  courseName: string | null
  totalHoyos: number
  /** Clave de formato (formato_juego); el label lo resuelve TorneoHeader. */
  format: string
  modo: 'gross' | 'neto'
  /** Estado crudo del torneo (draft|open|in_progress|closed|published). */
  status: string | null
  /** "En vivo" con nocion de fecha (torneoEnVivo) -- decide navy vs claro. */
  live: boolean
  dateDisplay: string
  coverImageUrl: string | null
  codigo: string | null
  slug: string
}

export function TournamentHeader(props: TournamentHeaderProps) {
  const { tournamentName, courseName, totalHoyos, format, modo, status, live, dateDisplay, coverImageUrl, codigo, slug } = props

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '16px 16px 0' }}>
      {/* Cover image con nombre overlayed */}
      {coverImageUrl && (
        <div
          style={{
            position: 'relative',
            borderRadius: '16px',
            overflow: 'hidden',
            marginBottom: '16px',
          }}
        >
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
              display: 'block',
              background: 'var(--surface-soft)',
            }}
          />
          {/* Gradiente + nombre overlayed */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '40px 24px 20px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
            }}
          >
            {/* Decorativo: el <h1> semántico vive en TorneoHeader más abajo.
                Usar <div> acá evita doble h1 por página (HTML semántico). */}
            <div
              aria-hidden="true"
              style={{
                margin: 0,
                fontFamily: "var(--font-playfair, Georgia, serif)",
                fontSize: '28px',
                lineHeight: 1.15,
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.01em',
                textShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
            >
              {tournamentName}
            </div>
            {courseName && (
              <div
                style={{
                  marginTop: '6px',
                  fontSize: '14px',
                  color: 'rgba(255,255,255,0.8)',
                  fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
                }}
              >
                {courseName}
              </div>
            )}
          </div>
        </div>
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
        right={<TournamentShareButton slug={slug} tournamentName={tournamentName} status={status} />}
      />

      {codigo && (
        <div
          style={{
            marginTop: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--surface-soft)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '6px 12px',
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-dm-sans, 'DM Sans', system-ui, sans-serif)",
              fontSize: '12px',
              color: 'var(--text-3)',
            }}
          >
            Unete con
          </span>
          <span style={{ fontFamily: 'var(--font-dm-mono, "DM Mono", monospace)', fontSize: '14px', color: 'var(--brand-on-bg)', fontWeight: 700, letterSpacing: '0.1em' }}>{codigo}</span>
        </div>
      )}
    </div>
  )
}
