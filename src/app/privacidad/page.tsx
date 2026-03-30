'use client'

import Link from 'next/link'

const S = {
  page: {
    background: 'var(--bg)',
    minHeight: '100vh',
    padding: '24px 16px 80px',
  } as React.CSSProperties,
  container: {
    maxWidth: 680,
    margin: '0 auto',
  } as React.CSSProperties,
  date: {
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: 11,
    color: 'var(--text-3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 8,
  } as React.CSSProperties,
  h1: {
    fontFamily: 'var(--font-playfair), serif',
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--ivory)',
    marginBottom: 32,
    lineHeight: 1.3,
  } as React.CSSProperties,
  h2: {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 17,
    fontWeight: 600,
    color: 'var(--gold)',
    marginTop: 36,
    marginBottom: 12,
  } as React.CSSProperties,
  body: {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 14,
    fontWeight: 400,
    color: 'var(--text)',
    lineHeight: 1.7,
    marginBottom: 16,
  } as React.CSSProperties,
  separator: {
    borderTop: '1px solid rgba(200,165,90,0.18)',
    margin: '36px 0',
  } as React.CSSProperties,
  link: {
    color: 'var(--brand)',
    textDecoration: 'underline',
  } as React.CSSProperties,
  list: {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 14,
    fontWeight: 400,
    color: 'var(--text)',
    lineHeight: 1.7,
    marginBottom: 16,
    paddingLeft: 24,
  } as React.CSSProperties,
}

export default function PrivacidadPage() {
  return (
    <div style={S.page}>
      <div style={S.container}>
        <p style={S.date}>Vigente desde 30 marzo 2026</p>
        <h1 style={S.h1}>Pol&iacute;tica de Privacidad</h1>

        <p style={S.body}>
          Esta pol&iacute;tica describe c&oacute;mo Golfers+ recopila, usa y protege la informaci&oacute;n personal
          de sus usuarios, en conformidad con la Ley 19.628 sobre Protecci&oacute;n de la Vida Privada de Chile.
        </p>

        <h2 style={S.h2}>1. Responsable del tratamiento</h2>
        <p style={S.body}>
          Juan Jos&eacute; Lamarca / Golfers+, con domicilio en Santiago, Chile. Contacto:{' '}
          <a href="mailto:juanjoselamarca@gmail.com" style={S.link}>juanjoselamarca@gmail.com</a>.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>2. Datos que recopilamos</h2>
        <p style={S.body}><strong>Datos que t&uacute; nos das directamente:</strong></p>
        <ul style={S.list}>
          <li>Nombre y correo electr&oacute;nico (al crear tu cuenta).</li>
          <li>Scores de golf y datos de tus rondas.</li>
          <li>Handicap index (opcional).</li>
        </ul>

        <p style={S.body}><strong>Datos que se generan al usar la app:</strong></p>
        <ul style={S.list}>
          <li>P&aacute;ginas visitadas y acciones realizadas (anal&iacute;tica an&oacute;nima).</li>
          <li>Errores t&eacute;cnicos que ocurren durante el uso (para corregirlos).</li>
          <li>Datos de rendimiento de la aplicaci&oacute;n.</li>
        </ul>

        <p style={S.body}><strong>Si inicias sesi&oacute;n con Google:</strong></p>
        <ul style={S.list}>
          <li>Nombre y correo electr&oacute;nico de tu cuenta de Google.</li>
          <li>Foto de perfil (si est&aacute; disponible).</li>
          <li>NO accedemos a tus contactos, archivos, ni otros datos de Google.</li>
        </ul>

        <h2 style={S.h2}>3. Datos que NO recopilamos</h2>
        <ul style={S.list}>
          <li>Datos de pago o informaci&oacute;n financiera.</li>
          <li>Ubicaci&oacute;n GPS.</li>
          <li>Datos de salud.</li>
          <li>Direcciones IP (desactivado expl&iacute;citamente en anal&iacute;tica).</li>
        </ul>

        <div style={S.separator} />

        <h2 style={S.h2}>4. Base legal</h2>
        <p style={S.body}>
          El tratamiento de datos personales se realiza con el consentimiento expreso del usuario al registrarse
          en la plataforma (checkbox obligatorio), conforme al Art&iacute;culo 4 de la Ley 19.628.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>5. Servicios de terceros</h2>
        <p style={S.body}>
          Para operar la plataforma, utilizamos los siguientes servicios externos.
          Todos operan bajo est&aacute;ndares de protecci&oacute;n de datos:
        </p>
        <ul style={S.list}>
          <li><strong>Supabase Inc.</strong> (EE.UU.) &mdash; Base de datos y autenticaci&oacute;n de cuentas.</li>
          <li><strong>Vercel Inc.</strong> (EE.UU.) &mdash; Hosting de la aplicaci&oacute;n.</li>
          <li><strong>Anthropic PBC</strong> (EE.UU.) &mdash; Motor de inteligencia artificial para tAIger+ (coach de golf). Tus datos de juego se env&iacute;an de forma an&oacute;nima para generar an&aacute;lisis.</li>
          <li><strong>Google</strong> (EE.UU.) &mdash; Inicio de sesi&oacute;n con Google (OAuth). Solo obtenemos nombre, email y foto de perfil.</li>
          <li><strong>Sentry</strong> (EE.UU.) &mdash; Monitoreo de errores t&eacute;cnicos. Captura errores de la app para que podamos corregirlos r&aacute;pidamente. Datos personales (email, nombre) se eliminan antes de enviar a Sentry.</li>
          <li><strong>PostHog</strong> (EE.UU.) &mdash; Anal&iacute;tica de uso. Registra p&aacute;ginas visitadas y acciones para mejorar la experiencia. Respeta la se&ntilde;al &ldquo;Do Not Track&rdquo; de tu navegador. No registra direcciones IP.</li>
        </ul>
        <p style={{ ...S.body, fontWeight: 600 }}>
          Golfers+ NO vende datos personales a anunciantes ni a terceros con fines comerciales.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>6. Cookies y almacenamiento local</h2>
        <p style={S.body}>
          Golfers+ utiliza:
        </p>
        <ul style={S.list}>
          <li><strong>Cookies de sesi&oacute;n</strong> &mdash; necesarias para mantener tu sesi&oacute;n activa (autenticaci&oacute;n). Sin estas, no puedes usar la app.</li>
          <li><strong>Almacenamiento local (localStorage)</strong> &mdash; para guardar tus scores temporalmente cuando no tienes conexi&oacute;n a internet, y para la anal&iacute;tica de uso.</li>
        </ul>
        <p style={S.body}>
          No utilizamos cookies publicitarias ni de seguimiento de terceros.
          Si tu navegador tiene activado &ldquo;Do Not Track&rdquo;, la anal&iacute;tica de uso se desactiva autom&aacute;ticamente.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>7. Retenci&oacute;n de datos</h2>
        <p style={S.body}>
          Los datos personales se conservan mientras la cuenta del usuario est&eacute; activa. Tras una solicitud
          de eliminaci&oacute;n, los datos ser&aacute;n eliminados en un plazo m&aacute;ximo de 30 d&iacute;as h&aacute;biles.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>8. Tus derechos (Art. 12 Ley 19.628)</h2>
        <p style={S.body}>Como usuario tienes derecho a:</p>
        <ul style={S.list}>
          <li><strong>Acceso:</strong> conocer qu&eacute; datos personales almacenamos sobre ti.</li>
          <li><strong>Rectificaci&oacute;n:</strong> corregir datos inexactos o incompletos.</li>
          <li><strong>Cancelaci&oacute;n:</strong> eliminar tu cuenta y todos tus datos personales.</li>
        </ul>
        <p style={S.body}>
          Puedes eliminar tu cuenta directamente desde tu perfil en la app.
          Tambi&eacute;n puedes escribirnos a{' '}
          <a href="mailto:juanjoselamarca@gmail.com" style={S.link}>juanjoselamarca@gmail.com</a>{' '}
          con el asunto &ldquo;DATOS PERSONALES&rdquo;. Responderemos en un m&aacute;ximo de 15 d&iacute;as h&aacute;biles.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>9. Reclamos</h2>
        <p style={S.body}>
          Si consideras que tus derechos han sido vulnerados, puedes presentar un reclamo ante el{' '}
          <strong>SERNAC</strong> (Servicio Nacional del Consumidor) o ante los tribunales ordinarios de
          Santiago de Chile.
        </p>

        <div style={S.separator} />

        <p style={{ ...S.body, color: 'var(--text-3)', marginTop: 24 }}>
          &Uacute;ltima actualizaci&oacute;n: 30 de marzo de 2026
        </p>

        <p style={{ ...S.body, marginTop: 8 }}>
          <Link href="/terminos" style={S.link}>T&eacute;rminos y Condiciones</Link>
          {' · '}
          <Link href="/reembolsos" style={S.link}>Pol&iacute;tica de Reembolsos</Link>
        </p>
      </div>
    </div>
  )
}
