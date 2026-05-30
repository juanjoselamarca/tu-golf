/* eslint-disable @next/next/no-img-element */
// src/app/torneo/[slug]/components/TournamentHeader.tsx
//
// Header del torneo: logo + foto de portada + título + chips
// (cancha, hoyos, formato, fecha, status) + código de inscripción.
// El botón "Modo TV" se removió del header público (decisión Juanjo
// inbox 35f4ee89, may-27). La ruta /torneo/[slug]/tv sigue accesible por URL.
// Estilo premium consistente con la marca (Playfair + DM Sans + DM Mono).

import Link from 'next/link'

export interface TournamentHeaderProps {
  tournamentName: string
  slug: string | null
  courseName: string | null
  totalHoyos: number
  formatLabel: string
  dateDisplay: string
  isLive: boolean
  isClosed: boolean
  coverImageUrl: string | null
  codigo: string | null
}

export function TournamentHeader(props: TournamentHeaderProps) {
  const {
    tournamentName, courseName, totalHoyos, formatLabel,
    dateDisplay, isLive, isClosed, coverImageUrl, codigo,
  } = props

  return (
    <div style={{ background: '#f8f9fa', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '16px 20px 0', maxWidth: '1080px', margin: '0 auto' }}>
        <Link href="/" className="flex items-center gap-1 group" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '18px', color: '#1a1a2e' }}>Golfers</span>
          <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '18px', color: '#c4992a' }}>+</span>
        </Link>
      </div>

      {coverImageUrl && (
        <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '16px 20px 0' }}>
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
              borderRadius: '12px',
              display: 'block',
              background: '#e5e7eb',
            }}
          />
        </div>
      )}

      <div style={{ padding: '24px 20px 20px', maxWidth: '1080px', margin: '0 auto' }}>
        <h1 style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '24px',
          fontWeight: 700,
          color: '#1a1a2e',
          margin: '0 0 8px',
          lineHeight: 1.2,
        }}>
          {tournamentName}
        </h1>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '13px', color: '#4a5568' }}>
          {courseName && <span>{courseName}</span>}
          {courseName && <span style={{ color: '#94a3b8' }}>&middot;</span>}
          <span>{totalHoyos}H</span>
          <span style={{ color: '#94a3b8' }}>&middot;</span>
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            background: 'rgba(196,153,42,0.15)',
            color: '#c4992a',
            border: '1px solid rgba(196,153,42,0.32)',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            fontFamily: '"DM Mono", monospace',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>{formatLabel}</span>
          <span style={{ color: '#94a3b8' }}>&middot;</span>
          <span>{dateDisplay}</span>

          {isLive && (
            <>
              <span style={{ color: '#94a3b8' }}>&middot;</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span className="live-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>EN VIVO</span>
              </span>
            </>
          )}
          {isClosed && (
            <>
              <span style={{ color: '#94a3b8' }}>&middot;</span>
              <span style={{ color: '#c4992a', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>FINALIZADO</span>
            </>
          )}
        </div>

        {codigo && (
          <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '8px', padding: '6px 12px' }}>
            <span style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontSize: '12px', color: '#94a3b8' }}>Únete con</span>
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '14px', color: '#c4992a', fontWeight: 700, letterSpacing: '0.1em' }}>{codigo}</span>
          </div>
        )}
      </div>
    </div>
  )
}
