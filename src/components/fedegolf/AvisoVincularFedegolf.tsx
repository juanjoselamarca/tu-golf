'use client'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Lock } from '@/components/icons'
import { FedegolfLogo } from '@/components/brand/FedegolfLogo'
import { FedegolfVincularModal } from '@/components/fedegolf/FedegolfVincularModal'
import { useAvisoVincularFedegolf } from '@/hooks/useAvisoVincularFedegolf'
import { useFedegolfVincular } from '@/hooks/useFedegolfVincular'
import { addToast } from '@/hooks/useToast'
import { FEDEGOLF_SIN_VINCULO } from '@/lib/data/perfil'
import { formatearIndice } from '@/golf/handicap-index-range'

/**
 * Aviso «Vincula tu FedeGolf» al abrir la app (una vez por usuario; reglas en
 * `useAvisoVincularFedegolf`). «Vincular» abre el mismo formulario de /perfil; «No vincular»,
 * Escape o tocar fuera lo cierran para siempre.
 */
export function AvisoVincularFedegolf() {
  const { fase, vincular, cerrar } = useAvisoVincularFedegolf()
  const fedegolf = useFedegolfVincular({
    onLinked: (r) => {
      cerrar()
      addToast({
        type: 'success',
        title: 'FedeGolf vinculado',
        message: r.indice != null ? `Tu índice oficial: ${formatearIndice(r.indice)}` : 'Tu índice se actualizará solo.',
        duration: 6000,
      })
    },
    onUnlinked: () => {},
  })

  if (fase === 'oculto') return null

  if (fase === 'formulario') {
    return (
      <FedegolfVincularModal
        open
        onClose={cerrar}
        status={FEDEGOLF_SIN_VINCULO}
        vincular={fedegolf.vincular}
        desvincular={fedegolf.desvincular}
        submitting={fedegolf.submitting}
        unlinking={fedegolf.unlinking}
        error={fedegolf.error}
        clearError={fedegolf.clearError}
      />
    )
  }

  return (
    <BottomSheet abierto onCerrar={cerrar} etiqueta="Vincula tu cuenta FedeGolf">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 4px 0' }}>
        <FedegolfLogo alto={32} alt="FedeGolf" />
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', margin: '20px 0 8px', lineHeight: 1.3 }}>
          Trae tu índice oficial
        </h2>
        <p style={{ fontSize: '16px', color: 'var(--text-2)', margin: 0, lineHeight: 1.5, maxWidth: '340px' }}>
          Vincula tu cuenta FedeGolf y tu índice se actualiza solo en tus rondas y torneos.
        </p>
        <p style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-2)', margin: '14px 0 22px' }}>
          <Lock size={14} strokeWidth={2} aria-hidden />
          Solo leemos tu índice. Nunca tocamos tu cuenta.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          <Button variant="commit" size="lg" fullWidth onClick={vincular}>
            Vincular
          </Button>
          <Button variant="ghost" size="md" fullWidth onClick={cerrar}>
            No vincular
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
