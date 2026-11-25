# Consejo en modo pantalla: Nueva ronda, Crear torneo e Inscripción — Decisión de producto

**Fecha:** 2026-11-24
**Origen:** primera corrida de `/consejo` en modo pantalla. En cada flujo opinaron el usuario de primera vez, el simplificador, el socio, el organizador y el pre-mortem, y después el presidente.
**Expedientes:** `.claude/expedientes/consejo-2026-11-24-{nueva-ronda,crear-torneo,inscripcion}/` (locales, no van al repo).
**Cuándo:** nada de esto sale antes del evento del sábado 28-nov (prod congelada).

## Nueva ronda (`/ronda-libre/nueva`)

- **Juanjo decidió: Stroke Play sigue partiendo en Gross, como hoy.** El consejo recomendaba Neto si el socio tiene índice, y Juanjo no lo aceptó. No se debe volver a proponer sin evidencia nueva de usuarios reales.
- Lo que sí se hace es simplificar: pasar de 4 pantallas a 2 (cancha, tee e índice; después el resumen en filas editables y «Crear ronda»). Neto o Gross queda siempre a la vista en el resumen. Se saca «Timba libre PRÓXIMAMENTE», y shotgun y fecha pasan a ser filas editables.
- «Jugar de nuevo» se descartó: con 7 creadores en 60 días no paga, y con «Cada uno en su celular» no hay un grupo guardado que repetir.
- Al comprimir no se toca «¿Quién anota?» antes de «Corregir» (#787).

## Inscripción a torneo (`/torneo/[slug]/unirse`)

- **Juanjo decidió:** el socio con cuenta y sin índice ya no queda bloqueado ni se le manda al perfil. Se inscribe en la misma pantalla, donde puede escribir **su índice o su hándicap de juego (el que sepa)**. La app calcula el otro con el CR, el slope y el par de la cancha del torneo, y lo **guarda también en su perfil**.
- Esto extiende la decisión del 16-nov («jugador sin índice → avisar y dejar iniciar») a la inscripción y reemplaza el guard de julio (#277).
- El bloqueo también vive en el servidor (`src/app/api/torneos/[slug]/inscribirse/route.ts`, `missing_index`), así que es zona crítica: revisor-fable.
- Hay que cuidar tres cosas: el hándicap de juego (16) no se puede confundir con el índice (14,3); se acepta coma decimal; los índices plus llevan el signo. Si se calcula el índice desde el hándicap, ese índice es aproximado (el redondeo pierde décimas) y la pantalla tiene que decirlo. «Scorear como invitado» pasa a llamarse «Inscribirme sin cuenta».

## Crear torneo (`/organizador/nuevo`)

- **Juanjo decidió: el asistente IA es una función Pro (paywall), hoy no habilitada.** Se minimiza: no puede ocupar el primer pantallazo ni mostrar «Cargando asistente…» antes del primer campo.
- **Juanjo aprobó el orden:**
  1. Primero un PR con el bug #775 (un índice plus se ve «-2» en HCP min/max) y Modo obligatorio, sin preelegir (hoy `src/lib/draft/initial-config.ts` deja `gross` al empezar desde cero).
  2. Después, rediseño dentro de la misma página, con variantes: una sola fecha, cancha antes que categorías, «HCP min/max» aclarando si es índice, lo opcional plegado al final y tocables de 44 px o más. La meta es pasar de 5,7 a 3 pantallas de alto.
- No se manda nada a «agregar después» en el panel: `EditTorneoForm` no edita premios, administradores ni categorías.
- Pendiente de verificar antes de mover categorías: si cambiarlas con inscritos ya adentro los reasigna bien.

## Hallazgo medido después (sin decisión todavía)

- En Nueva ronda, los pasos Jugadores y Confirmar aparecen 272 px más abajo de su inicio (lo midió el recorrido con `llegaDesplazada`). La persona llega sin ver el encabezado del paso. Revisarlo junto con la compresión a 2 pantallas.
