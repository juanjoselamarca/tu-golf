// src/app/organizador/page.tsx
//
// Lista de torneos del organizador. Punto de entrada desde "Mis Torneos" en
// el Navbar. Server component con auth obligatorio.

import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import { FORMATS } from '@/golf/formats'
import { tournamentStatusBadge } from '@/golf/tournament-status'

export const metadata: Metadata = {
  title: 'Mis Torneos — Golfers+',
}

export const dynamic = 'force-dynamic'

// ─── Types ───

interface TournamentRow {
  id: string
  name: string
  slug: string
  format: string
  status: string | null
  date_start: string | null
  hole_count: number
  player_count: number
}

// ─── Helpers ───

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatName(key: string): string {
  return FORMATS[key]?.name ?? key
}

// ─── Page ───

export default async function OrganizadorPage() {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?next=/organizador')

  // Fetch tournaments owned by user.
  const { data: rawTournaments } = await supabase
    .from('tournaments')
    .select('id, name, slug, format, status, date_start, hole_count')
    .eq('organizer_id', user.id)
    .order('date_start', { ascending: false })

  const tournamentRows = rawTournaments ?? []

  // Count players per tournament in one query (all confirmed players).
  const tournamentIds = tournamentRows.map((t) => t.id as string)
  let playerCounts: Record<string, number> = {}
  if (tournamentIds.length > 0) {
    const { data: playerData } = await supabase
      .from('players')
      .select('tournament_id')
      .in('tournament_id', tournamentIds)
    if (playerData) {
      for (const p of playerData) {
        const tid = p.tournament_id as string
        playerCounts[tid] = (playerCounts[tid] ?? 0) + 1
      }
    }
  }

  const tournaments: TournamentRow[] = tournamentRows.map((t) => ({
    id: t.id as string,
    name: (t.name as string) ?? 'Sin nombre',
    slug: (t.slug as string) ?? '',
    format: (t.format as string) ?? 'stroke_play',
    status: (t.status as string | null) ?? 'draft',
    date_start: t.date_start as string | null,
    hole_count: (t.hole_count as number) ?? 18,
    player_count: playerCounts[t.id as string] ?? 0,
  }))

  // Also fetch drafts so the user sees WIP tournaments
  const { data: rawDrafts } = await supabase
    .from('tournament_drafts')
    .select('id, name, updated_at')
    .eq('owner_id', user.id)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(10)

  const drafts = rawDrafts ?? []

  return (
    <div style={{ background: 'var(--bg-primary, #ffffff)', minHeight: '100vh' }}>
      <div style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '24px 16px 80px',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}>
          <h1 style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--text-primary, #111)',
            margin: 0,
          }}>
            Mis Torneos
          </h1>
          <Link
            href="/organizador/nuevo"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              borderRadius: 10,
              background: 'var(--brand, #1a1a2e)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            + Crear torneo
          </Link>
        </div>

        {/* Tournament cards */}
        {tournaments.length === 0 && drafts.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}

            {drafts.length > 0 && tournaments.length > 0 && (
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-secondary, #666)',
                marginTop: 12,
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                Borradores sin publicar
              </div>
            )}

            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Components ───

function TournamentCard({ tournament: t }: { tournament: TournamentRow }) {
  const { label, bg, fg } = tournamentStatusBadge(t.status, 'organizer')

  return (
    <Link
      href={`/organizador/${t.slug}/jugadores`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div style={{
        background: 'var(--bg-card, #fff)',
        border: '1px solid var(--border-primary, #e5e5e5)',
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'box-shadow 0.15s ease',
      }}>
        {/* Top row: name + badge */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary, #111)',
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
          }}>
            {t.name}
          </div>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 6,
            background: bg,
            color: fg,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {label}
          </span>
        </div>

        {/* Bottom row: meta */}
        <div style={{
          display: 'flex',
          gap: 16,
          fontSize: 13,
          color: 'var(--text-secondary, #666)',
          flexWrap: 'wrap',
        }}>
          <span>{formatDate(t.date_start)}</span>
          <span>{formatName(t.format)}</span>
          <span>{t.hole_count}h</span>
          <span>{t.player_count} jugador{t.player_count !== 1 ? 'es' : ''}</span>
        </div>
      </div>
    </Link>
  )
}

function DraftCard({ draft }: { draft: { id: string; name: string | null; updated_at: string } }) {
  return (
    <Link
      href={`/organizador/nuevo?draft=${draft.id}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div style={{
        background: 'var(--bg-card, #fff)',
        border: '1px dashed var(--border-primary, #d4d4d4)',
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          fontSize: 15,
          fontWeight: 500,
          color: 'var(--text-primary, #111)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {draft.name || 'Borrador sin nombre'}
        </div>
        <span style={{
          fontSize: 12,
          color: 'var(--text-tertiary, #999)',
          whiteSpace: 'nowrap',
        }}>
          {formatDate(draft.updated_at)}
        </span>
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center',
      padding: '60px 20px',
    }}>
      <div style={{
        fontSize: 48,
        marginBottom: 16,
        opacity: 0.3,
      }}>
        🏆
      </div>
      <h2 style={{
        fontSize: 18,
        fontWeight: 600,
        color: 'var(--text-primary, #111)',
        margin: '0 0 8px',
      }}>
        Sin torneos todavia
      </h2>
      <p style={{
        fontSize: 14,
        color: 'var(--text-secondary, #666)',
        margin: '0 0 24px',
        lineHeight: 1.5,
      }}>
        Crea tu primer torneo y comparte el link de inscripcion con tus jugadores.
      </p>
      <Link
        href="/organizador/nuevo"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '12px 28px',
          borderRadius: 10,
          background: 'var(--brand, #1a1a2e)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        + Crear torneo
      </Link>
    </div>
  )
}
