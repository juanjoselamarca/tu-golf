'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ExperiencePanel } from '@/components/ExperienceSetup'
import { LevelsBar } from '@/components/perfil/LevelsBar'
import { getNivel } from '@/lib/mi-golf/niveles'
import IndiceBreakdownModal from '@/components/IndiceBreakdownModal'
import InstallAppCard from '@/components/InstallAppCard'
import type { Profile, ResultadoCPI, FedegolfStatus } from '@/lib/data/perfil'
import { useProfileEdit } from '../hooks/useProfileEdit'
import { useFedegolfRefresh } from '../hooks/useFedegolfRefresh'
import { useFedegolfVincular } from '../hooks/useFedegolfVincular'
import { FedegolfVincularModal } from './FedegolfVincularModal'
import { ProfileHeaderCard } from './ProfileHeaderCard'
import { DefaultTeeBanner } from '@/components/DefaultTeeBanner'
import { DualIndexCards } from './DualIndexCards'
import { CpiCard } from './CpiCard'
import { AccountSection } from './AccountSection'
import { DeleteAccountModal } from './DeleteAccountModal'
import { GapNote, NivelBadge, SyncHistorialBlock } from './EditorialBlocks'

interface Props {
  initialProfile: Profile
  userEmail: string | null
  tourneysPlayed: number
  cpiData: ResultadoCPI | null
  initialFedegolfStatus: FedegolfStatus
}

export function PerfilView({ initialProfile, userEmail, tourneysPlayed, cpiData, initialFedegolfStatus }: Props) {
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [fedegolfStatus, setFedegolfStatus] = useState<FedegolfStatus>(initialFedegolfStatus)
  const [vincularOpen, setVincularOpen] = useState(false)
  const edit = useProfileEdit(profile, setProfile)
  const fedegolf = useFedegolfRefresh(profile, setProfile)

  // Vincular/desvincular FedeGolf. Al vincular, el backend ya guardó el índice
  // oficial en profiles.indice; lo reflejamos en la UI sin recargar.
  const fedegolfVincular = useFedegolfVincular({
    onLinked: (indice) => {
      setFedegolfStatus({ vinculado: true, ultimoIndice: indice, ultimoSync: new Date().toISOString() })
      if (indice != null) setProfile((p) => ({ ...p, indice }))
    },
    onUnlinked: () => setFedegolfStatus({ vinculado: false, ultimoIndice: null, ultimoSync: null }),
  })

  // Niveles Golfers+ por skill (handicap). Prioriza Índice Golfers+
  // si está calculado (rendimiento real); fallback a Federación.
  const indiceParaNivel = profile.indice_golfers ?? profile.indice

  return (
    <div style={{
      background: 'var(--bg-surface)',
      minHeight: '100vh',
      // padding-bottom: el bottom-nav fijo mide 52px + safe-area-inset-bottom (15-20px en
      // iOS). 80px previos no alcanzaba en dispositivos con notch → la card "Tu experiencia"
      // se cortaba al fondo (inbox 164b8c80). 100px + safe-area da gap consistente con
      // /perfil/historial.
      paddingTop: '16px',
      paddingLeft: '16px',
      paddingRight: '16px',
      paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
    }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '16px' }}>
          ← Dashboard
        </Link>

        <DefaultTeeBanner />

        <ProfileHeaderCard
          profile={profile}
          tourneysPlayed={tourneysPlayed}
          onAddIndice={() => { edit.setEditing(true); setTimeout(() => document.getElementById('edit-form')?.scrollIntoView({ behavior: 'smooth' }), 100) }}
        />

        <DualIndexCards
          profile={profile}
          fedegolf={fedegolf}
          vinculado={fedegolfStatus.vinculado}
          onOpenVincular={() => setVincularOpen(true)}
          onOpenBreakdown={() => setBreakdownOpen(true)}
        />

        {/* P18: link explicativo — "¿Cuándo uso cuál?" */}
        <div style={{ marginBottom: '12px', textAlign: 'center', animation: 'profileIn 480ms cubic-bezier(0.16,1,0.3,1) both', animationDelay: '180ms' }}>
          <Link href="/indices" style={{
            fontSize: '12px', color: '#c4992a', textDecoration: 'none',
            fontFamily: '"DM Sans", system-ui, sans-serif', fontWeight: 600,
            padding: '6px 10px', borderRadius: '8px',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
          }}>
            ¿Cuándo uso cuál? →
          </Link>
        </div>

        {/* Install card persistente — inbox 7ea72a78. Solo aparece si no está
            instalada como PWA. Una vez instalada, en Android los links de
            golfersplus.vercel.app se abren automáticamente en la app. */}
        <InstallAppCard />

        <GapNote profile={profile} />

        <NivelBadge profile={profile} />

        {/* CPI Section */}
        <CpiCard cpiData={cpiData} />

        {indiceParaNivel != null && <LevelsBar nivel={getNivel(indiceParaNivel)} />}

        <AccountSection profile={profile} userEmail={userEmail} edit={edit} />

        <SyncHistorialBlock />

        {/* Notification settings */}
        <div style={{ marginTop: '16px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <ExperiencePanel />
        </div>

        <DeleteAccountModal />
      </div>

      <style>{`
        @keyframes profileIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Modal "¿Qué rondas cuentan?" — inbox 82af3d48 */}
      <IndiceBreakdownModal isOpen={breakdownOpen} onClose={() => setBreakdownOpen(false)} />

      {/* Modal vincular/gestionar FedeGolf — inbox 2f76dcaf */}
      <FedegolfVincularModal
        open={vincularOpen}
        onClose={() => setVincularOpen(false)}
        status={fedegolfStatus}
        vincular={fedegolfVincular.vincular}
        desvincular={fedegolfVincular.desvincular}
        submitting={fedegolfVincular.submitting}
        unlinking={fedegolfVincular.unlinking}
        error={fedegolfVincular.error}
        clearError={fedegolfVincular.clearError}
      />
    </div>
  )
}
