/**
 * Copy del HOME de marketing (Golfers+).
 *
 * Fuente única de verdad para todo el texto visible del landing. Los componentes
 * consumen de acá — NO se hardcodea copy en JSX.
 *
 * Reglas duras (ver memoria `project_home_mensaje_marketing` + test `home.test.ts`):
 * - Español latinoamericano NEUTRO. Voseo PROHIBIDO (el test lo bloquea).
 * - Tono premium / app de elite. Sin relleno ni buzzwords.
 * - Honestidad de marca: sin Strokes Gained numérico ni dispersión de tiros (el
 *   motor no los calcula; el coach detecta patrones). Importación = guiada
 *   (foto/smartwatch/CSV), NO trackeo tiro por tiro. 137 canchas federadas = real.
 * - Marcas con riesgo legal fuera: no nombrar marcas de relojes ni a la Federación
 *   (usar "smartwatch / app de golf" y "canchas federadas con rating oficial").
 * - Nunca hablar de "perder" golpes para referir a mejorar: enfoque en dónde se
 *   gana / la próxima oportunidad. "Bajar el hándicap" → "tu mejor golf / camino a
 *   scratch" (scratch es faro aspiracional, NO promesa).
 * - Números ilustrativos viven en los componentes/fixtures, no acá.
 */

export const HOME = {
  hero: {
    eyebrow: 'El golf amateur en español · Chile y LatAm',
    titleLine1: 'Se gana con la mente.',
    titleLine2: 'No con los fierros.',
    subtitle:
      'Sube tu ronda. El coach la lee y te da una sola cosa, medible, para tu próxima salida. Tu mejor golf no está en palos nuevos.',
    ctaPrimary: 'Crear cuenta gratis',
    ctaSecondary: 'Probar el tracer',
    trustLine1: 'Gratis para empezar · Sin tarjeta · En español',
    trustLine2: '137 canchas chilenas federadas, con rating oficial',
  },

  /** Widget broadcast del PGA Tour. La data viene del API en vivo; acá solo el copy. */
  pga: {
    liveLabel: 'En vivo · PGA Tour',
    nextLabel: 'Próximo · PGA Tour',
    finalLabel: 'Final · PGA Tour',
    movingDay: 'Moving Day',
    finalRound: 'Ronda Final',
    cutProjected: 'Corte proyectado',
    cut: 'Corte',
    passedSuffix: 'pasaron', // "Corte · −1 · pasaron 66"
    colToday: 'Hoy',
    colTotal: 'Total',
    nextEventLabel: 'Próximo evento',
    defendingChampLabel: 'Campeón defensor',
    championLabel: 'Campeón',
    footer: 'El golf en vivo, también en Golfers+',
  },

  game: {
    eyebrow: 'Pruébalo · sin registrarte',
    titleLine1: 'Pega tu tiro.',
    titleLine2: 'Apunta a la bandera.',
    desc:
      'Mide la potencia y suéltala. Tienes 3 tiros. Es lo más entretenido del golf… y casi nunca lo que define tu tarjeta.',
    hudShot: 'Tiro',
    hudToFlag: 'A bandera',
    pureBadge: 'PURO · al centro',
    btnHit: 'Pega',
    btnHitAgain: 'Pega otra',
    btnReplay: 'Jugar de nuevo',
    reactions: {
      nearFlag: 'A bandera, al centro. Puro placer. Igual, una ronda se arma con la cabeza.',
      short: 'Cortito. Tranquilo: el drive casi nunca es lo que define tu ronda.',
      mid: 'Sólido. ¿Y sabes dónde se gana de verdad una ronda?',
      sweet: 'Plano y al centro. Igual, ganar no es pegar lejos: es pensar mejor.',
      generic: 'Buen palazo. Pero a scratch no se llega con metros: se llega con cabeza.',
    },
    funnelText: 'El drive fue lo divertido. El score se arma en otra parte.',
    funnelCta: 'Descubre dónde se gana de verdad',
  },

  coach: {
    eyebrow: 'El coach tAIger+',
    titleLine1: 'Tu mejor golf,',
    titleLine2: 'ronda a ronda.',
    subtitle:
      'Tú solo registras tu ronda. El coach hace el resto — y mientras más juegas, mejor te conoce.',
    steps: [
      {
        title: 'Registra tu ronda',
        desc:
          'Esto es lo único que haces tú. El coach trabaja con tu tarjeta de siempre: la marcas en vivo, le sacas una foto o la sincronizas desde tu smartwatch. Sin anotar tiro por tiro.',
        chips: ['En vivo', 'Foto', 'Smartwatch'],
      },
      {
        title: 'Encuentra dónde se gana',
        desc:
          'El coach detecta el patrón exacto donde está tu próximo salto. Por ejemplo: el back nine es tu mayor oportunidad —son 2 golpes, y es presión, no tu swing.',
      },
      {
        title: 'Te da tu plan',
        desc:
          'Una sola cosa medible para tu próxima salida. Y mide si funcionó, ronda tras ronda, hasta que se note en tu juego.',
        planLabel: 'Lado seguro del green · hoyos 13-16',
        planMeta: 'meta: −2 golpes esta ronda',
      },
    ],
  },

  compete: {
    eyebrow: 'Torneos · scoring en vivo',
    titleLine1: 'El golf se gana en la cabeza.',
    titleLine2: 'Se disfruta acompañado.',
    desc:
      'Arma un torneo o una ronda entre amigos en segundos. Comparte un link y todos siguen el ranking moverse hoyo a hoyo desde su celular — sin planillas ni esperar la tarjeta final.',
    cta: 'Así funciona un torneo',
    leaderboardTitle: 'Muchachos Ryder Cup 2026',
    leaderboardLive: 'EN VIVO · Hoyo 14',
    leaderboardFooter: 'Comparte el link · todos siguen el torneo desde su celular',
  },

  features: {
    eyebrow: 'Todo tu golf · en un solo lugar',
    titleLine1: 'Lo que necesitas,',
    titleLine2: 'sin planillas ni apps sueltas.',
    items: [
      {
        kicker: '01 · Índice',
        title: 'Índice Dual',
        desc:
          'Tu hándicap WHS oficial y tu nivel real de juego, lado a lado. Uno para competir parejo; el otro, para ver cuánto avanzas de verdad.',
        vizOfficial: 'Hándicap WHS oficial',
        vizReal: 'Tu nivel real de juego',
      },
      {
        kicker: '02 · Carga',
        title: 'Importación guiada',
        desc:
          'Sube una foto de tu tarjeta o sincroniza desde tu smartwatch o app de golf. El sistema lee los scores por ti, hoyo por hoyo — sin teclear nada.',
        chips: ['Foto', 'Smartwatch', 'CSV'],
      },
      {
        kicker: '03 · Canchas',
        title: '137 canchas federadas',
        desc:
          'Las canchas chilenas con su rating y slope oficiales. Eliges dónde jugaste y los cálculos salen exactos.',
      },
      {
        kicker: '04 · Historial',
        title: 'Historial que progresa',
        desc:
          'Cada ronda queda guardada. Ves tu juego avanzar con el tiempo, con todos tus números a mano cuando los necesitas.',
        vizLabel: 'Tu progreso en el tiempo',
      },
    ],
  },

  plans: {
    eyebrow: 'Planes · gratis para empezar',
    titleLine1: 'Empieza gratis.',
    titleLine2: 'Mejora con tu coach.',
    subtitle:
      'Registra y compite sin pagar nada. Cuando quieras jugar tu mejor golf, el coach Pro te arma el plan.',
    free: {
      name: 'Gratis',
      tag: 'Para registrar y competir',
      features: [
        'Score en vivo y torneos ilimitados',
        '137 canchas federadas con rating oficial',
        'Índice Dual e historial completo',
        'El diagnóstico del coach en cada ronda',
      ],
      cta: 'Crear cuenta gratis',
    },
    pro: {
      ribbon: 'Recomendado',
      name: 'Pro',
      tag: 'Para jugar tu mejor golf',
      features: [
        'Todo lo de Gratis, con el coach completo',
        'Un plan medible y personalizado tras cada ronda',
        'Seguimiento de tu progreso, ronda a ronda',
        'Un coach que aprende tu juego y se adapta a ti',
      ],
      trialHook: 'Tus 3 primeras rondas con el coach completo — gratis y sin tarjeta.',
      cta: 'Probar el coach gratis',
    },
    footer: 'Sin tarjeta para empezar · Cancela cuando quieras · Hecho en Chile, en español',
  },

  cta: {
    eyebrow: 'Empieza hoy',
    titleLine1: 'El swing lo trabajas hace años.',
    titleLine2: 'Empieza hoy con tu mente.',
    steps: [
      {
        num: '01',
        title: 'Crea tu cuenta',
        desc: 'Gratis, en 30 segundos. Sin tarjeta, sin descargar nada.',
      },
      {
        num: '02',
        title: 'Suma tu primera ronda',
        desc: 'Una foto de tu tarjeta, tu smartwatch o marcando en vivo. El sistema la lee por ti.',
      },
      {
        num: '03',
        title: 'El coach te arma tu plan',
        desc: 'Encuentra tu próxima oportunidad y te da una cosa concreta para trabajar. Ronda a ronda.',
      },
    ],
    ctaPrimary: 'Crear cuenta gratis',
    ctaSecondary: 'Ver una ronda de ejemplo',
    risk: 'Sin tarjeta · Cancela cuando quieras · Tus datos son tuyos',
    proof: {
      coursesLabel: 'canchas chilenas con rating oficial',
      freeLabel: 'gratis para empezar',
      madeIn: 'Hecho en Chile · en español',
    },
  },
} as const

export type HomeContent = typeof HOME
