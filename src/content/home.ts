/**
 * Copy del HOME de marketing (Golfers+).
 *
 * Fuente única de verdad para todo el texto visible del landing. Los componentes
 * consumen de acá — NO se hardcodea copy en JSX.
 *
 * Reglas duras (ver memoria `project_home_mensaje_marketing` + test `home.test.ts`):
 * - Español latinoamericano NEUTRO. Voseo PROHIBIDO (el test lo bloquea).
 * - Honestidad de marca: sin Strokes Gained numérico ni dispersión de tiros (el
 *   motor no los calcula). Importación = guiada (foto/Garmin/CSV). 137 canchas = real.
 * - Números ilustrativos viven en los componentes/fixtures, no acá.
 */

export const HOME = {
  hero: {
    eyebrow: 'El golf amateur en español · Chile y LatAm',
    titleLine1: 'Se gana con la mente.',
    titleLine2: 'No con los fierros.',
    subtitle:
      'Sube tu ronda, el coach la analiza y te da una sola cosa medible para bajar tu hándicap. Sin cambiar de palos.',
    ctaPrimary: 'Crear cuenta gratis',
    ctaSecondary: 'Probar el tracer',
    trustLine1: 'Sin tarjeta · Sin descarga · En español',
    trustLine2: '137 canchas chilenas con rating oficial · Federación de Golf de Chile',
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
      'Aprieta en el punto justo de la potencia y lanza. Tienes 3 tiros. Así de fácil registra Golfers+ cada golpe — y así aprende tu juego.',
    hudShot: 'Tiro',
    hudToFlag: 'A bandera',
    pureBadge: 'PURO · al centro',
    btnHit: 'Pega',
    btnHitAgain: 'Pega otra',
    btnReplay: 'Jugar de nuevo',
    reactions: {
      nearFlag: 'A bandera. Centrado. Así de preciso lee el motor cada tiro tuyo.',
      short: 'Cortito — pero tranquilo, el drive casi nunca es donde se pierden los golpes.',
      mid: 'Sólido. ¿Y adivina dónde se te escapan los golpes de verdad?',
      sweet: 'Plano, al centro. Igual: ganar no es pegar lejos, es pensar mejor.',
      generic: 'Buen palazo. Aunque el hándicap no baja con metros — baja con cabeza.',
    },
    funnelText: 'El drive fue lo divertido. Pero ahí no se pierde el hándicap.',
    funnelCta: 'Descubre dónde SÍ pierdes golpes',
  },

  coach: {
    eyebrow: 'El coach tAIger+',
    titleLine1: 'Así te baja el hándicap,',
    titleLine2: 'ronda a ronda.',
    subtitle:
      'Tú solo registras tu ronda. El coach hace el resto — y mientras más juegas, mejor te conoce.',
    steps: [
      {
        title: 'Registra tu ronda',
        desc:
          'Esto es lo único que haces tú. El coach trabaja con tu tarjeta de siempre: la marcas en vivo, le sacas una foto o conectas tu Garmin. Sin anotar tiro por tiro.',
        chips: ['En vivo', 'Foto', 'Garmin'],
      },
      {
        title: 'Encuentra tu fuga',
        desc:
          'Detecta el patrón exacto que te cuesta golpes. Por ejemplo: pierdes 2 golpes en el back nine — y es presión, no tu swing.',
      },
      {
        title: 'Te da tu plan',
        desc:
          'Una sola cosa medible para tu próxima salida. Y mide si funcionó, hasta que tu hándicap baje.',
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
      'Crea tu campeonato en segundos, comparte el link y todo tu grupo ve el ranking moverse hoyo a hoyo —desde el celular, sin planillas ni esperar el final.',
    cta: 'Así funciona un torneo',
    leaderboardTitle: 'Copa Las Brisas',
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
          'Tu hándicap oficial WHS y tu nivel real de juego, lado a lado. Uno para competir parejo, otro para ver cuánto progresas de verdad.',
        vizOfficial: 'Hándicap WHS oficial',
        vizReal: 'Tu nivel real de juego',
      },
      {
        kicker: '02 · Carga',
        title: 'Importación guiada',
        desc:
          'Sube una foto de tu tarjeta, conecta tu Garmin o un CSV. El sistema lee los scores por ti — sin teclear hoyo por hoyo.',
        chips: ['Foto', 'Garmin', 'CSV'],
      },
      {
        kicker: '03 · Canchas',
        title: '137 canchas FedeGolf',
        desc:
          'Todas las canchas chilenas con su rating oficial de la Federación. Eliges dónde jugaste y los cálculos salen exactos.',
      },
      {
        kicker: '04 · Historial',
        title: 'Historial que progresa',
        desc:
          'Cada ronda queda guardada. Ves tu hándicap bajar con el tiempo y tienes todos tus números a mano cuando los necesitas.',
        vizLabel: 'Tu hándicap en el tiempo',
      },
    ],
  },

  plans: {
    eyebrow: 'Planes · gratis para empezar',
    titleLine1: 'Empieza gratis.',
    titleLine2: 'Mejora con tu coach.',
    subtitle:
      'Registra y compite sin pagar nada. Cuando quieras bajar el hándicap de verdad, el coach Pro te arma el plan.',
    free: {
      name: 'Gratis',
      tag: 'Para registrar y competir',
      features: [
        'Score en vivo y torneos ilimitados',
        '137 canchas FedeGolf con rating oficial',
        'Índice Dual e historial completo',
        'Diagnóstico del coach en cada ronda',
      ],
      cta: 'Crear cuenta gratis',
    },
    pro: {
      ribbon: 'Recomendado',
      name: 'Pro',
      tag: 'Para bajar tu hándicap',
      features: [
        'Todo lo del plan Gratis',
        'Un plan de mejora medible tras cada ronda',
        'Seguimiento ronda a ronda hasta que baje',
        'Un coach que te conoce y ajusta contigo',
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
        desc: 'Una foto de tu tarjeta, tu Garmin o marcando en vivo. El sistema la lee por ti.',
      },
      {
        num: '03',
        title: 'El coach te arma tu plan',
        desc: 'Encuentra tu fuga de golpes y te da una cosa para trabajar. Ronda a ronda.',
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
