// src/components/mi-golf/CompetenciaHero.tsx
// Hero del dashboard (ronda en vivo / próximo torneo / vacío) + acciones primarias.
// Extraído de CompetenciaTab.tsx (680 LOC) por la regla 'el que toca, ordena'.
import Link from 'next/link'
import type { Tournament, RondaLibre } from '@/lib/mi-golf/types'
import { GOLD, TEXT, TEXT_2, BORDER, BG_SOFT } from './competencia-tokens'

export function HeroActiva({
  ronda,
  summary,
}: {
  ronda: RondaLibre
  summary: { hoyoActual: number; totalHoyos: number; scoreParcial: number | null } | null
}) {
  return (
    <Link
      href={`/ronda-libre/${ronda.codigo}/score`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        background: GOLD,
        color: '#fff',
        borderRadius: '12px',
        padding: '18px 20px',
        marginBottom: '20px',
        textDecoration: 'none',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px rgba(34,197,94,0.7)',
              animation: 'livePulse 2s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-dm-mono)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontWeight: 700,
              color: '#fff',
            }}
          >
            En vivo
          </span>
        </div>
        <div style={{ fontSize: '17px', fontWeight: 700, lineHeight: 1.2 }}>{ronda.course_name}</div>
        {summary && (
          <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '4px' }}>
            Hoyo {summary.hoyoActual} de {summary.totalHoyos} · Continuar →
          </div>
        )}
      </div>
      {summary?.scoreParcial != null && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-playfair)', fontSize: '32px', fontWeight: 700, lineHeight: 1 }}>
            {summary.scoreParcial >= 0 ? '+' : ''}{summary.scoreParcial}
          </div>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px', fontWeight: 600, opacity: 0.85 }}>
            vs par
          </div>
        </div>
      )}
    </Link>
  )
}

export function HeroProximo({
  torneo,
}: {
  torneo: Tournament & { horaSalida: string | null; diasRestantes: number }
}) {
  const countdown = torneo.diasRestantes === 0 ? 'Hoy' : torneo.diasRestantes === 1 ? '1d' : `${torneo.diasRestantes}d`
  const sub = torneo.horaSalida
    ? `${torneo.courses?.nombre ?? 'Cancha'} · Salida ${torneo.horaSalida}`
    : (torneo.courses?.nombre ?? 'Cancha por confirmar')

  return (
    <Link
      href={`/torneo/${torneo.slug}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        background: 'var(--bg-surface)',
        color: TEXT,
        border: `1px solid ${GOLD}`,
        borderLeft: `4px solid ${GOLD}`,
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        textDecoration: 'none',
      }}
    >
      <div>
        <div style={{ fontSize: '11px', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: GOLD, marginBottom: '6px' }}>
          Próximo compromiso
        </div>
        <div style={{ fontSize: '17px', fontWeight: 700, lineHeight: 1.2 }}>{torneo.name}</div>
        <div style={{ fontSize: '12px', color: TEXT_2, marginTop: '4px' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-playfair)', fontSize: '32px', fontWeight: 700, lineHeight: 1, color: GOLD }}>
          {countdown}
        </div>
        <div style={{ fontSize: '10px', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px', fontWeight: 600, color: TEXT_2 }}>
          restantes
        </div>
      </div>
    </Link>
  )
}

export function HeroVacio() {
  return (
    <div
      style={{
        background: BG_SOFT,
        borderRadius: '12px',
        padding: '18px 20px',
        marginBottom: '20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '14px', color: TEXT, fontWeight: 500, marginBottom: '6px' }}>
        Sin torneos ni rondas en curso
      </div>
      <div style={{ fontSize: '12px', color: TEXT_2 }}>¿Quieres jugar hoy?</div>
    </div>
  )
}

export function Acciones() {
  return (
    <div style={{ marginBottom: '28px' }}>
      <Link
        href="/ronda-libre/nueva"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          background: TEXT,
          color: '#fff',
          borderRadius: '14px',
          padding: '16px 20px',
          fontSize: '15px',
          fontWeight: 700,
          textDecoration: 'none',
          minHeight: '56px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontSize: '20px', fontWeight: 300, lineHeight: 1 }}>+</span>
        Nueva ronda
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          fontSize: '12px',
        }}
      >
        <Link
          // `/torneo/nuevo` NO existe como ruta. Caía en el catch-all
          // `/torneo/[slug]`, que hasta el 20-jul rellenaba un torneo DEMO del
          // TPC Sawgrass marcado EN VIVO y desde entonces devuelve 404: el CTA
          // principal de la home nunca llevó al creador de torneos. La ruta real
          // es la que ya usa el Navbar (`Navbar.tsx:625`).
          href="/organizador/nuevo"
          style={{
            color: TEXT_2,
            fontWeight: 500,
            textDecoration: 'none',
            borderBottom: `1px solid ${BORDER}`,
            paddingBottom: '2px',
          }}
        >
          Organizar torneo
        </Link>
        <Link
          href="/torneo/unirme"
          style={{
            color: TEXT_2,
            fontWeight: 500,
            textDecoration: 'none',
            borderBottom: `1px solid ${BORDER}`,
            paddingBottom: '2px',
          }}
        >
          Unirme con código
        </Link>
      </div>
    </div>
  )
}
