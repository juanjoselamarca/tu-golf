'use client'

// src/app/organizador/nuevo/components/AssistantHero.tsx
//
// Hero del asistente IA — entrada principal del flujo AI-first. El chat lleva
// al organizador desde lenguaje natural a config viva. Gateado por plan PRO y
// aislado con un error boundary: si el panel lanza, el formulario sigue vivo.

import { Component, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { captureError } from '@/lib/error-tracking'
import { ProGate } from '@/components/billing/ProGate'
import { UpsellCard } from '@/components/billing/UpsellCard'
import type { ApplyAssistantConfig } from '../hooks/useDraftActions'

// Import dinámico con ssr:false y placeholder si falla la carga.
const AssistantPanel = dynamic(
  () =>
    import('@/components/tournament-draft/AssistantPanel').then((mod) => mod.default).catch(() => {
      const Fallback = () => (
        <div style={placeholderStyle}>Asistente todavía no disponible.</div>
      )
      Fallback.displayName = 'AssistantPanelFallback'
      return Fallback
    }),
  {
    ssr: false,
    loading: () => <div style={placeholderStyle}>Cargando asistente...</div>,
  },
)

export interface AssistantHeroProps {
  draftId: string
  onChangeApplied: ApplyAssistantConfig
}

export function AssistantHero({ draftId, onChangeApplied }: AssistantHeroProps) {
  return (
    <section style={heroStyle} aria-label="Asistente IA del torneo">
      <ProGate
        feature="tournament-ai-assistant"
        fallback={
          <UpsellCard
            feature="tournament-ai-assistant"
            title="Asistente IA de torneo"
            description="Crea y configura tu torneo en lenguaje natural con inteligencia artificial"
          />
        }
      >
        <AssistantErrorBoundary>
          <AssistantPanel draftId={draftId} onChangeApplied={onChangeApplied} />
        </AssistantErrorBoundary>
      </ProGate>
    </section>
  )
}

// Aisla crashes del chat IA: si el panel del asistente lanza, el resto del
// editor (formulario, footer, preview) sigue funcionando — y el organizador
// ve un mensaje en vez de pantalla blanca.
class AssistantErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err: Error) {
    captureError(err, { context: 'assistant_error_boundary' })
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ ...placeholderStyle, fontFamily: '"DM Sans", sans-serif' }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
            Asistente no disponible.
          </p>
          <p style={{ margin: '8px 0 0' }}>
            Puedes seguir editando manualmente. Recarga la página para reintentar.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// Card prominente con gradient sutil + border gold para señalar IA.
const heroStyle: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid var(--border-md)',
  background: 'linear-gradient(180deg, rgba(196, 153, 42, 0.04) 0%, var(--bg-surface) 60%)',
  boxShadow: 'var(--shadow-card), 0 12px 32px rgba(10, 20, 25, 0.06)',
  overflow: 'hidden',
}

const placeholderStyle: React.CSSProperties = {
  padding: 20,
  fontSize: 13,
  color: 'var(--text-secondary)',
}
