// src/app/organizador/page.tsx
//
// "Mis Torneos" — lista de torneos del organizador.
// Punto de entrada desde el Navbar. Server component con auth obligatorio.

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Trophy, Plus, Calendar, Users, Flag } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
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
  status: string
  date_start: string | null
  hole_count: number
  player_count: number
}

// ─── Helpers ───

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  return new Date(iso).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Page ───

export default async function OrganizadorPage() {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?next=/organizador')

  const { data: rawTournaments } = await supabase
    .from('tournaments')
    .select('id, name, slug, format, status, date_start, hole_count')
    .eq('organizer_id', user.id)
    .order('date_start', { ascending: false })

  const tournamentRows = rawTournaments ?? []

  // Contar jugadores por torneo en una sola query
  const tournamentIds = tournamentRows.map((t) => t.id as string)
  const playerCounts: Record<string, number> = {}
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

  // Borradores sin publicar
  const { data: rawDrafts } = await supabase
    .from('tournament_drafts')
    .select('id, name, updated_at')
    .eq('owner_id', user.id)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(10)

  const drafts = rawDrafts ?? []

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg-surface)', paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto max-w-[640px] px-4 pt-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            Mis Torneos
          </h1>
          <Link
            href="/organizador/nuevo"
            className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand, #1a1a2e)' }}
          >
            <Plus size={16} strokeWidth={2.5} />
            Crear torneo
          </Link>
        </div>

        {/* Contenido */}
        {tournaments.length === 0 && drafts.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {tournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}

            {drafts.length > 0 && tournaments.length > 0 && (
              <p
                className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-2)' }}
              >
                Borradores sin publicar
              </p>
            )}

            {drafts.map((d) => (
              <DraftCard
                key={d.id}
                id={d.id as string}
                name={(d.name as string | null) ?? null}
                updatedAt={d.updated_at as string}
              />
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
  const formatName = FORMATS[t.format]?.name ?? t.format

  return (
    <Link
      href={`/organizador/${t.slug}/jugadores`}
      className="block rounded-2xl border transition-shadow hover:shadow-md"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'rgba(196,153,42,0.22)',
      }}
    >
      <div className="flex flex-col gap-2.5 p-4">
        {/* Nombre + badge */}
        <div className="flex items-start justify-between gap-3">
          <span
            className="text-base font-semibold leading-snug"
            style={{ color: 'var(--text)' }}
          >
            {t.name}
          </span>
          <span
            className="shrink-0 rounded-md px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: bg, color: fg }}
          >
            {label}
          </span>
        </div>

        {/* Meta */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]"
          style={{ color: 'var(--text-2)' }}
        >
          <span className="inline-flex items-center gap-1">
            <Calendar size={13} />
            {formatDate(t.date_start)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Flag size={13} />
            {formatName} · {t.hole_count}h
          </span>
          <span className="inline-flex items-center gap-1">
            <Users size={13} />
            {t.player_count} jugador{t.player_count !== 1 ? 'es' : ''}
          </span>
        </div>
      </div>
    </Link>
  )
}

function DraftCard({ id, name, updatedAt }: { id: string; name: string | null; updatedAt: string }) {
  return (
    <Link
      href={`/organizador/nuevo?draft=${id}`}
      className="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-3.5 transition-shadow hover:shadow-sm"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border)',
      }}
    >
      <span
        className="min-w-0 flex-1 truncate text-[15px] font-medium"
        style={{ color: 'var(--text)' }}
      >
        {name || 'Borrador sin nombre'}
      </span>
      <span className="shrink-0 text-xs" style={{ color: 'var(--text-2)' }}>
        {formatDate(updatedAt)}
      </span>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center">
      <div className="mb-4 rounded-2xl p-4" style={{ background: 'rgba(196,153,42,0.08)' }}>
        <Trophy size={32} strokeWidth={1.5} style={{ color: '#c4992a' }} />
      </div>
      <h2
        className="mb-2 text-lg font-semibold"
        style={{ color: 'var(--text)' }}
      >
        Sin torneos todavía
      </h2>
      <p
        className="mb-6 max-w-[280px] text-sm leading-relaxed"
        style={{ color: 'var(--text-2)' }}
      >
        Crea tu primer torneo y comparte el link de inscripción con tus jugadores.
      </p>
      <Link
        href="/organizador/nuevo"
        className="inline-flex items-center gap-1.5 rounded-xl px-7 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: 'var(--brand, #1a1a2e)' }}
      >
        <Plus size={16} strokeWidth={2.5} />
        Crear torneo
      </Link>
    </div>
  )
}
