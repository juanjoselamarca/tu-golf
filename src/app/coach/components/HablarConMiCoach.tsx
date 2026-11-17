import Link from 'next/link'

/**
 * CTA principal hacia una conversación nueva con el coach. Lo usan la bienvenida
 * (sin rondas) y el estado de error de rondas: el coach sigue accesible aunque
 * no se hayan podido leer las rondas.
 */
export function HablarConMiCoach() {
  return (
    <Link
      href="/coach/sesion/nueva"
      style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px', background: 'var(--coach-brass)', color: 'var(--bg)', fontWeight: 700, fontSize: '14px', padding: '12px 28px', borderRadius: '10px', textDecoration: 'none' }}
    >
      Hablar con mi coach
    </Link>
  )
}
