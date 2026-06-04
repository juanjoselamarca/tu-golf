import { TaigerIcon } from '@/components/icons/TaigerIcon'

// Skeleton instantáneo mientras el Server Component trae los datos.
// Next muestra esto apenas se navega a /coach, sin esperar JS de cliente.
export default function CoachLoading() {
  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: '12px', animation: 'tpulse 1.5s ease infinite', color: 'var(--coach-brass)' }}><TaigerIcon size={48} /></div>
        <div style={{ color: 'var(--text-2)', fontSize: '14px', fontWeight: 600 }}>Cargando tAIger+...</div>
        <style>{`@keyframes tpulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
      </div>
    </div>
  )
}
