import Link from 'next/link'

/**
 * CTA principal hacia el coach: la conversación principal si existe; si no, una nueva. Lo usan la bienvenida
 * (sin rondas) y el estado de error de rondas: el coach sigue accesible aunque
 * no se hayan podido leer las rondas.
 */
export function HablarConMiCoach({ href = '/coach/sesion/nueva' }: { href?: string } = {}) {
  return (
    <Link
      href={href}
      style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px', background: 'var(--coach-brass)', color: 'var(--bg)', fontWeight: 700, fontSize: '14px', padding: '12px 28px', borderRadius: '10px', textDecoration: 'none' }}
    >
      Hablar con mi coach
    </Link>
  )
}
