# MOBILE UX PREMIUM AUDIT

## 1. Resumen ejecutivo

El producto ya muestra una intención mobile-first real y no se siente como una simple versión reducida de desktop. Hay varias decisiones correctas para uso en cancha, especialmente en el flujo de scoring de ronda libre, donde la app se acerca bastante a una experiencia ágil, clara y confiable desde el celular.

Dicho eso, el nivel general todavía no es premium. Hoy la experiencia global se siente desigual: algunas pantallas están bien resueltas y otras todavía se perciben como funcionales, densas o demasiado web en su lógica. La app tiene base para competir en percepción de calidad, pero aún no alcanza una consistencia de producto premium en navegación, jerarquía, velocidad de comprensión y refinamiento visual-operativo.

Fortalezas principales:
- Hay una dirección visual clara y una identidad de producto reconocible.
- El scoring de ronda libre está muy bien enfocado para móvil y es el benchmark interno más fuerte.
- Existen buenas bases ergonómicas: targets grandes en varios puntos, safe areas, sticky actions, feedback de guardado y foco claro en el uso principal.

Debilidades principales:
- La calidad UX no es consistente entre flujos críticos.
- El scoring de torneo no está al nivel del contexto real de uso móvil.
- Leaderboard, historial y dashboard tienden a mostrar demasiada información a la vez.
- La navegación general todavía se siente más “web app con secciones” que “producto mobile premium”.
- Falta más polish en estados, microinteracciones, mensajes y sensación de control.

Areas más críticas:
- Scoring de torneo
- Leaderboard mobile
- Navegación general
- Dashboard/home como centro de acción
- Consistencia de sistema visual y feedback operativo

Distancia a una experiencia premium:
- Global: media
- En scoring de ronda libre: corta
- En scoring de torneo y leaderboard: todavía relevante

## 2. Diagnóstico global

### Claridad
- Nivel: 7/10
- La app suele dejar claro qué pantalla es y qué objetivo tiene, pero varias vistas presentan demasiados elementos, métricas, bloques y acciones simultáneas. La claridad existe, pero no siempre está optimizada para lectura rápida en movimiento.

### Fluidez
- Nivel: 6.5/10
- Hay flujos con buena continuidad, especialmente en ronda libre, pero el producto completo no mantiene la misma sensación de flujo. Varias pantallas largas, tablas, bloques y cambios de contexto reducen la sensación de continuidad premium.

### Facilidad de uso
- Nivel: 7/10
- La app es usable y varios recorridos principales funcionan bien. Aun así, en contextos reales de una mano, sol, apuro y atención parcial, algunas pantallas siguen pidiendo más precisión visual y más decisiones de las ideales.

### Percepción premium
- Nivel: 6/10
- La marca y ciertos layouts transmiten ambición premium, pero la inconsistencia entre pantallas, la densidad de algunos flujos y la falta de micro-polish hacen que todavía se sienta más “muy buen producto en construcción” que “producto premium terminado”.

### Consistencia
- Nivel: 5.5/10
- El sistema visual tiene una identidad clara, pero la implementación es irregular: spacing, tamaños, jerarquías, patrones de encabezado, densidad y comportamiento de acciones no siguen siempre la misma lógica.

### Velocidad percibida
- Nivel: 6.5/10
- Algunas pantallas comunican agilidad; otras cargan demasiado contenido visual o conceptual arriba del fold. La sensación de rapidez podría mejorar mucho con más foco, menos ruido y mejor progressive disclosure.

### Confianza
- Nivel: 6.5/10
- El producto genera bastante confianza en los mejores flujos, pero pierde puntos cuando el estado actual no es totalmente obvio, cuando hay mensajes menos refinados o cuando una pantalla parece más técnica/operativa que guiada.

### Ergonomía
- Nivel: 7/10
- Hay decisiones correctas para móvil, pero no se sostienen en toda la app. En pantalla crítica como scoring de torneo y leaderboard todavía hay demasiada densidad, targets pequeños y patrones que exigen más precisión de la deseable.

### Evaluación global
- Nivel actual del producto en móvil: bueno
- Nivel objetivo para competir como experiencia premium: premium claro y consistente
- Brecha principal: no es falta de producto; es falta de homogeneidad, priorización visual y refinamiento mobile en los flujos con mayor uso recurrente.

## 3. Evaluación por flujo

### Login / registro

#### Qué está bien
- Hay foco en una tarea principal por pantalla.
- La visual transmite intención de marca y evita verse genérica.
- El acceso social reduce fricción potencial.
- La estructura es suficientemente simple para no perder a un usuario nuevo.

#### Qué está mal o débil
- El registro no se siente tan directo como podría; hay más estructura de la necesaria para una tarea que debe sentirse instantánea.
- El “Registro Express” plegable agrega una capa mental extra en vez de simplificar.
- La experiencia es correcta, pero no especialmente memorable ni superior en sensación de facilidad.
- Faltan más señales de confianza y claridad contextual para usuarios que llegan por primera vez.

#### Fricciones concretas
- Demasiado énfasis visual en contenedores y secciones respecto al objetivo inmediato.
- Falta mayor guía microcopy sobre qué pasa después de registrarse o por qué conviene cada método.
- La experiencia se siente más “pantalla bien diseñada” que “flujo obsesivamente optimizado”.

#### Oportunidades de mejora
- Hacer más obvio el camino principal.
- Reducir pasos mentales y ruido decorativo en registro.
- Introducir más señales de seguridad, rapidez y bajo esfuerzo.

#### Quick wins
- Simplificar headers y textos de apoyo.
- Reforzar prioridad visual del CTA principal.
- Unificar mejor el tono y el feedback de errores de formulario.

#### Mejoras estructurales
- Rediseñar la entrada al registro para que sea más lineal, más confiable y menos “modular”.
- Optimizar el flujo para una primera sesión de menos fricción y mayor certeza.

#### Nivel actual
- Buena

### Home / dashboard

#### Qué está bien
- Hay visión de producto y una intención aspiracional clara.
- Se entiende que la app quiere ser más que una utilidad mínima.
- El dashboard concentra información y accesos de valor.

#### Qué está mal o débil
- El home tiene una carga de marca y marketing relativamente alta para móvil.
- El dashboard tiende a ser largo y denso.
- Hay múltiples tarjetas y secciones con peso similar, lo que diluye la prioridad.
- No siempre queda claro cuál es la mejor siguiente acción para ese usuario en ese momento.

#### Fricciones concretas
- Mucho scroll para encontrar lo más útil.
- Exceso de bloques compitiendo por atención.
- Falta una jerarquía más agresiva orientada a acción recurrente.

#### Oportunidades de mejora
- Transformar el dashboard en un centro de decisión más corto, calmado y contextual.
- Priorizar una o dos acciones principales según estado del usuario.
- Llevar más contenido secundario a capas posteriores.

#### Quick wins
- Reducir densidad del primer viewport.
- Reordenar bloques para que “seguir jugando / continuar / ver torneo / cargar score” aparezca antes que contenido más descriptivo.
- Ajustar espaciado y peso visual entre tarjetas.

#### Mejoras estructurales
- Diseñar un dashboard mobile de “hoy” y no solo un resumen general.
- Separar mejor contenido operativo, histórico y aspiracional.

#### Nivel actual
- Correcta a buena

### Scoring torneo

#### Qué está bien
- La funcionalidad existe y permite gestionar scoring real.
- El sistema intenta dar contexto, resumen y edición en la misma vista.
- Hay intención de cubrir un caso operativo completo.

#### Qué está mal o débil
- Es el flujo más claramente por debajo del estándar premium mobile.
- La interfaz se apoya demasiado en tablas, grillas y controles pequeños.
- Requiere mucha precisión visual y motriz para un contexto de cancha.
- Se siente más como una consola operativa que como una experiencia móvil elegante y segura.

#### Fricciones concretas
- Densidad alta de columnas y datos.
- Inputs y controles pequeños para uso con una mano.
- Demasiadas decisiones simultáneas en pantalla.
- Riesgo alto de error por toque equivocado o lectura incompleta.
- Falta una progresión más guiada por hoyo, jugador y acción inmediata.

#### Oportunidades de mejora
- Replantear completamente el flujo como una experiencia mobile nativa de captura, no como una tabla comprimida.
- Llevar la interacción a unidades simples: hoyo actual, jugador actual, score actual, confirmación.
- Hacer el estado de guardado y edición mucho más tranquilizador.

#### Quick wins
- Aumentar targets y reducir cantidad de información visible por fila.
- Destacar más claramente el hoyo activo y la acción principal.
- Reducir elementos secundarios en la vista principal.

#### Mejoras estructurales
- Rediseñar el scoring de torneo bajo los mismos principios que el scoring de ronda libre.
- Migrar de grid densa a cards, pasos cortos, tabs contextuales o stack por jugador/hoyo.
- Añadir mejor prevención de error y confirmación contextual.

#### Nivel actual
- Correcta

### Scoring ronda libre

#### Qué está bien
- Es el flujo más fuerte de toda la app.
- La jerarquía es muy clara: hoyo, score, avance, siguiente acción.
- Los controles son grandes y entendibles.
- Hay buena sensación de control con feedback de guardado, progreso y navegación entre hoyos.
- La sticky action ayuda mucho en contexto móvil real.
- La experiencia transmite velocidad y cierta sofisticación.

#### Qué está mal o débil
- Todavía hay momentos de sobrecarga debajo del fold.
- Algunos elementos secundarios compiten con la tarea principal.
- La mini vista de score y algunos bloques informativos pueden quedarse pequeños para lectura rápida al sol.
- El polish aún puede subir en feedback de éxito, corrección de errores y sensación de “estado seguro”.

#### Fricciones concretas
- El usuario puede tener más contexto del necesario mientras está cargando scores.
- Algunas áreas secundarias invitan a explorar cuando lo principal debería dominar por completo.
- La confirmación de que el dato quedó realmente bien puede sentirse algo sutil.

#### Oportunidades de mejora
- Hacer la experiencia aún más extrema en foco: capturar, confirmar, avanzar.
- Mejorar feedback visual y emocional de guardado.
- Refinar qué información se muestra durante scoring y cuál se posterga.

#### Quick wins
- Reducir protagonismo de módulos secundarios mientras el usuario está en modo captura.
- Hacer más visible el estado “guardado / pendiente / offline”.
- Mejorar contraste y tamaño de algunos textos auxiliares.

#### Mejoras estructurales
- Crear un modo de scoring “ultra focus” aún más limpio.
- Introducir patrones premium de validación contextual, autocorrección y recuperación de errores.

#### Nivel actual
- Muy buena

### Leaderboard

#### Qué está bien
- Tiene identidad, presencia y ambición visual.
- El contexto competitivo se entiende.
- Hay elementos pensados para seguir el torneo y no solo listar datos.
- La experiencia intenta ser emocionante, no meramente funcional.

#### Qué está mal o débil
- En móvil todavía pesa demasiado la lógica de tabla.
- La cantidad de información visible y expandible puede cansar rápido.
- Comparar jugadores o seguir cambios no siempre es tan inmediato como debería.
- Hay riesgo de fatiga visual por densidad y variación de componentes dentro de la misma vista.

#### Fricciones concretas
- Scroll horizontal o compresión excesiva.
- Mucho dato de golpe antes de decidir qué importa.
- Falta una capa más fuerte de resumen, foco y contexto sticky.

#### Oportunidades de mejora
- Reimaginar el leaderboard mobile como una experiencia de cards competitivas con contexto fijo.
- Priorizar comparación rápida, posición, diferencia y estado.
- Llevar scorecards y detalle profundo a capas más progresivas.

#### Quick wins
- Simplificar la primera vista.
- Mejorar separación entre información primaria y secundaria.
- Reforzar elementos sticky o resúmenes persistentes.

#### Mejoras estructurales
- Rediseñar leaderboard móvil alrededor de scanability, no de tabla.
- Usar disclosure progresivo para scorecards, stats y detalle extendido.

#### Nivel actual
- Buena

### Perfil

#### Qué está bien
- Se siente cuidado visualmente.
- Comunica progreso, métricas e identidad del jugador.
- Tiene suficiente riqueza para dar sensación de producto serio.

#### Qué está mal o débil
- La pantalla puede sentirse algo larga y cargada.
- No siempre queda claro qué es información para mirar y qué es para accionar.
- Hay un sesgo a exhibir datos, más que a ayudar a tomar una acción concreta.

#### Fricciones concretas
- Exceso de bloques con peso visual parecido.
- Múltiples métricas compitiendo sin una narrativa principal.
- Menor sensación de utilidad inmediata frente a otras secciones.

#### Oportunidades de mejora
- Darle una narrativa más clara: progreso, estado actual, siguiente mejora.
- Hacer más evidente qué puede hacer el usuario desde ahí.

#### Quick wins
- Reordenar métricas por importancia real.
- Reducir ruido visual en segmentos secundarios.
- Mejorar agrupación de información relacionada.

#### Mejoras estructurales
- Transformar el perfil en una vista más accionable y menos enciclopédica.
- Separar mejor identidad, rendimiento e historial.

#### Nivel actual
- Buena

### Historial

#### Qué está bien
- Tiene profundidad funcional.
- Hay intención de capturar suficiente contexto histórico para generar valor.
- La pantalla no se queda corta en capacidad.

#### Qué está mal o débil
- Es uno de los flujos más densos de la app.
- La cantidad de inputs, métricas y datos puede abrumar en móvil.
- La experiencia exige más lectura y más paciencia que la ideal para uso frecuente.

#### Fricciones concretas
- Formato largo y cargado.
- Muchas decisiones micro.
- Dificultad para distinguir rápidamente qué es prioritario.

#### Oportunidades de mejora
- Reducir carga cognitiva a través de agrupación, pasos o capas.
- Priorizar lectura rápida y edición gradual.
- Hacer la pantalla más escaneable y menos formulario largo.

#### Quick wins
- Mejorar jerarquía de secciones.
- Compactar contenido secundario.
- Aumentar legibilidad de encabezados y resúmenes.

#### Mejoras estructurales
- Rediseñar historial como experiencia de resumen primero y detalle después.
- Dividir edición y consulta cuando hoy estén demasiado mezcladas.

#### Nivel actual
- Correcta a buena

### Insights / GWI / tAIger

#### Qué está bien
- Hay intención de diferenciar el producto con una capa más inteligente y aspiracional.
- El tono de producto busca valor agregado y no solo utilidad básica.
- Visualmente tiene personalidad.

#### Qué está mal o débil
- Varias vistas se sienten más conceptuales que fluidas.
- Hay bastante densidad de copy y tarjetas.
- La experiencia todavía no convierte lo complejo en algo realmente simple y tranquilizador.
- El valor puede sentirse prometido antes que consumido con facilidad.

#### Fricciones concretas
- Mucha lectura en móvil.
- Conceptos y mensajes que requieren atención sostenida.
- Menor claridad sobre el mejor siguiente paso.

#### Oportunidades de mejora
- Simplificar brutalmente la primera capa.
- Convertir insights en decisiones accionables y fáciles de comprender.
- Hacer que la experiencia “se lea sola” más rápido.

#### Quick wins
- Reducir copy inicial.
- Mejorar jerarquía entre insight principal, explicación y CTA.
- Usar más resúmenes y menos bloques equivalentes.

#### Mejoras estructurales
- Rediseñar los módulos de coach/insights para priorizar guidance y no densidad.
- Crear una estructura más emocionalmente segura y menos técnica/productocéntrica.

#### Nivel actual
- Correcta

### Navegación general

#### Qué está bien
- Hay navegación funcional y las pantallas principales son accesibles.
- El menú móvil cumple y evita quedar bloqueado en escritorio-adaptado.
- Existen patrones de regreso y continuidad en varios puntos.

#### Qué está mal o débil
- La app todavía no se siente gobernada por una arquitectura mobile premium unificada.
- Faltan patrones persistentes y naturales de orientación.
- Cambiar entre áreas puede requerir más memoria del usuario que reconocimiento inmediato.
- No siempre hay una “base” móvil claramente definida.

#### Fricciones concretas
- Distintas pantallas resuelven headers, backs y acciones de manera diferente.
- La navegación depende más de explorar que de seguir un sistema evidente.
- Puede costar ubicar rápido secciones recurrentes.

#### Oportunidades de mejora
- Definir una lógica mobile más consistente para home, scoring, leaderboard, perfil e insights.
- Reforzar navegación de alta frecuencia con patrones más naturales para pulgar y uso repetido.

#### Quick wins
- Unificar headers, acciones primarias y comportamiento de back.
- Simplificar rutas mentales entre dashboard, torneos, scoring y perfil.

#### Mejoras estructurales
- Diseñar un sistema de navegación móvil de primer nivel, no solo un menú responsive.
- Establecer una arquitectura estable de secciones principales y acciones recurrentes.

#### Nivel actual
- Correcta

## 4. Top oportunidades de mejora

1. Replantear el scoring de torneo como una experiencia mobile nativa
- Problema actual: hoy depende de una lógica visual demasiado densa para uso real en cancha.
- Mejora propuesta: rediseñar alrededor de hoyo actual, jugador actual, score actual y feedback inmediato.
- Impacto esperado: menos errores, más velocidad, mayor confianza, percepción premium directa.
- Prioridad: crítica

2. Rediseñar leaderboard mobile para scanability
- Problema actual: la experiencia sigue demasiado cerca de una tabla comprimida.
- Mejora propuesta: cards competitivas, contexto sticky, comparaciones rápidas y detalle progresivo.
- Impacto esperado: mejor comprensión, menor fatiga, mayor retención de consulta.
- Prioridad: alta

3. Convertir el dashboard en un centro de acción y no de acumulación
- Problema actual: demasiados bloques compiten por atención.
- Mejora propuesta: priorización fuerte de la siguiente mejor acción y reducción de ruido inicial.
- Impacto esperado: más claridad, más uso recurrente, onboarding mental más rápido.
- Prioridad: alta

4. Unificar el sistema de navegación mobile
- Problema actual: la navegación general todavía se siente heterogénea.
- Mejora propuesta: arquitectura móvil consistente para secciones, back patterns y acciones frecuentes.
- Impacto esperado: menor fricción, más orientación, sensación de app madura.
- Prioridad: alta

5. Bajar la densidad informativa en historial e insights
- Problema actual: demasiada lectura, muchos bloques, demasiadas decisiones pequeñas.
- Mejora propuesta: progressive disclosure, resúmenes más fuertes, CTAs más claros.
- Impacto esperado: más comprensión, menos abandono, mejor valor percibido.
- Prioridad: alta

6. Elevar el polish operativo del scoring de ronda libre
- Problema actual: ya es bueno, pero aún no llega al máximo nivel de confianza y refinamiento.
- Mejora propuesta: mejor feedback de guardado, modo ultra focus, contraste y priorización más agresiva.
- Impacto esperado: experiencia diferencial, más placer de uso, mayor sensación premium.
- Prioridad: media-alta

7. Construir consistencia visual de sistema
- Problema actual: spacing, jerarquía, botones, densidad y headers varían demasiado entre pantallas.
- Mejora propuesta: unificar patrones de layout, cards, CTAs, badges, estados y ritmo vertical.
- Impacto esperado: percepción de calidad mucho más alta sin cambiar el core del producto.
- Prioridad: alta

8. Mejorar legibilidad real en contexto outdoor
- Problema actual: varios textos secundarios y labels son pequeños o de contraste limitado.
- Mejora propuesta: reforzar contraste, tamaño y jerarquía para lectura de reojo y bajo sol.
- Impacto esperado: menos errores, menos esfuerzo visual, mejor uso en cancha.
- Prioridad: alta

## 5. Quick wins

- Subir contraste y tamaño de textos secundarios en pantallas críticas.
- Hacer más visible el estado de guardado, sincronización y offline en scoring.
- Reducir información secundaria arriba del fold en dashboard, leaderboard y scoring.
- Unificar mejor estilos de headers, back actions y CTAs primarios.
- Reforzar separación visual entre información primaria y secundaria.
- Simplificar microcopy en login, registro, insights e historial.
- Mejorar pressed states, selected states y estados vacíos/carga para que se sientan más intencionales.
- Disminuir el peso de módulos secundarios durante la captura de score.

## 6. Mejoras estructurales

- Rediseñar scoring de torneo desde cero con criterio mobile-first real.
- Definir una arquitectura de navegación móvil persistente y coherente.
- Replantear leaderboard como experiencia de seguimiento competitivo para celular, no como tabla responsive.
- Reestructurar dashboard alrededor de contexto actual y acciones prioritarias.
- Crear un sistema de jerarquía visual transversal para todas las pantallas clave.
- Separar mejor modos de consulta, edición y captura en flujos densos como historial.
- Simplificar la capa de insights para que entregue valor claro en menos tiempo y con menos esfuerzo mental.

## 7. Detalles premium

- Confirmaciones de guardado más elegantes y tranquilizadoras.
- Microanimaciones discretas al avanzar hoyo, guardar score o cambiar jugador.
- Estados pressed/active más ricos y táctiles.
- Skeletons más pulidos y menos genéricos.
- Resúmenes sticky con contexto persistente en scoring y leaderboard.
- Mejor uso de color para diferenciar estado, prioridad y confianza sin saturar.
- Mayor consistencia en radios, sombras, padding y alturas de componentes.
- Mensajes de éxito y error más sobrios, claros y “premium”.
- Modos de foco donde la UI elimine ruido durante tareas críticas.
- Jerarquías tipográficas más firmes para que lo importante se lea en menos de un segundo.

## 8. Riesgos de UX si se lanza hoy

- El usuario puede percibir una app ambiciosa pero todavía irregular en calidad.
- El scoring de torneo puede generar errores de uso o sensación de poca comodidad en contexto real.
- El leaderboard puede cansar o requerir demasiado esfuerzo para seguir lo importante.
- El dashboard puede diluir valor si no conduce con fuerza a la siguiente acción.
- Historial e insights pueden sentirse más pesados que útiles en móvil frecuente.
- La inconsistencia entre flujos puede afectar confianza y percepción premium.
- Frente a apps mejor resueltas del mercado, el producto puede verse fuerte en intención pero todavía no memorable en ejecución.

## 9. Backlog recomendado para Claude

### Crítico

#### 1. Rediseñar scoring de torneo para móvil real
- Problema que resuelve: densidad excesiva, riesgo de error y baja ergonomía.
- Por qué importa: es un flujo central y su calidad impacta confianza directa en el producto.
- Impacto esperado: mayor velocidad, menos errores, mejor adopción en cancha.
- Tipo de mejora: flujo, ergonomía, confianza

#### 2. Reordenar dashboard alrededor de acción prioritaria
- Problema que resuelve: exceso de bloques y falta de dirección clara.
- Por qué importa: el home/dashboard define sensación de orden y utilidad recurrente.
- Impacto esperado: menor carga cognitiva, mayor activación y retorno.
- Tipo de mejora: flujo, navegación, jerarquía

#### 3. Mejorar leaderboard para consumo móvil
- Problema que resuelve: fatiga por tablas, baja scanability y comparación poco fluida.
- Por qué importa: es una vista de alto valor emocional y recurrente.
- Impacto esperado: mejor seguimiento, mayor engagement y percepción premium.
- Tipo de mejora: flujo, visual, ergonomía

### Alto impacto

#### 4. Unificar sistema de navegación mobile
- Problema que resuelve: navegación heterogénea y falta de orientación persistente.
- Por qué importa: reduce fricción transversal en toda la app.
- Impacto esperado: más claridad, más velocidad de uso, mayor sensación de madurez.
- Tipo de mejora: navegación, consistencia

#### 5. Elevar el foco del scoring de ronda libre
- Problema que resuelve: todavía existe ruido secundario durante la tarea principal.
- Por qué importa: es el mejor flujo actual y debe convertirse en referencia premium.
- Impacto esperado: experiencia más elegante, más confiable y más placentera.
- Tipo de mejora: flujo, microinteracción, confianza

#### 6. Reducir densidad en historial e insights
- Problema que resuelve: exceso de lectura, bloques y decisiones pequeñas.
- Por qué importa: hoy estas áreas pueden sentirse pesadas y bajar uso recurrente.
- Impacto esperado: mayor comprensión, mejor retención, más valor percibido.
- Tipo de mejora: flujo, jerarquía, claridad

#### 7. Normalizar sistema visual transversal
- Problema que resuelve: inconsistencia entre pantallas en spacing, CTAs, headers y densidad.
- Por qué importa: la percepción premium depende mucho de la coherencia.
- Impacto esperado: producto más pulido, más confiable y más competitivo.
- Tipo de mejora: visual, consistencia

### Mejora premium

#### 8. Crear estados operativos premium
- Problema que resuelve: feedback funcional pero todavía poco memorable.
- Por qué importa: los detalles construyen confianza y calidad percibida.
- Impacto esperado: mayor sensación de control y sofisticación.
- Tipo de mejora: microinteracción, confianza

#### 9. Optimizar legibilidad outdoor
- Problema que resuelve: textos pequeños o contraste limitado en escenarios reales.
- Por qué importa: el producto vive en la cancha, no solo en interiores.
- Impacto esperado: menos esfuerzo visual, menos errores y mejor satisfacción.
- Tipo de mejora: accesibilidad útil, ergonomía

#### 10. Definir patrones de progressive disclosure premium
- Problema que resuelve: demasiada información simultánea en varias vistas.
- Por qué importa: una app premium no abruma; revela lo correcto en el momento correcto.
- Impacto esperado: experiencia más liviana, más clara y más moderna.
- Tipo de mejora: flujo, jerarquía, visual

## 10. Prompt final para Claude

```md
Quiero que trabajes sobre este proyecto como Product Designer + Frontend Engineer con obsesión por mobile-first premium UX.

## Contexto

Producto:
App web mobile-first de golf orientada a scoring, torneos, leaderboard, historial e insights.

Stack:
- Next.js 14
- TypeScript
- Tailwind
- Supabase

Objetivo:
Llevar la experiencia móvil a un estándar claramente superior: ultra intuitiva, rápida, confiable y premium, especialmente en escenarios reales de uso en cancha.

## Prioridades absolutas

1. Scoring torneo
2. Leaderboard mobile
3. Navegación general
4. Dashboard/home
5. Refinamiento premium del scoring de ronda libre

## Diagnóstico resumido

- El producto ya tiene intención mobile-first real, pero la calidad UX no es consistente entre flujos.
- El scoring de ronda libre es el mejor benchmark interno y debe tomarse como referencia.
- El scoring de torneo sigue siendo demasiado denso y poco ergonómico para uso real en cancha.
- El leaderboard móvil todavía depende demasiado de patrones tipo tabla y genera más esfuerzo del ideal.
- El dashboard muestra demasiadas cosas con prioridad visual similar.
- La navegación general aún se siente más “web responsive” que “sistema mobile premium”.
- Historial e insights son valiosos pero demasiado densos para uso recurrente cómodo.
- Falta un nivel superior de polish en estados, feedback, microinteracciones, jerarquía visual y consistencia transversal.

## Qué implementar primero

### Fase 1
- Rediseñar scoring de torneo con criterio mobile-first real
- Priorizar velocidad de input, una mano, prevención de error y claridad extrema
- Evitar tablas comprimidas como patrón principal

### Fase 2
- Rediseñar leaderboard para móvil
- Priorizar scanability, comparación rápida, sticky context y detalle progresivo

### Fase 3
- Reestructurar dashboard/home para conducir a la siguiente mejor acción
- Reducir ruido y densidad en el primer viewport

### Fase 4
- Unificar sistema de navegación mobile
- Normalizar headers, back behavior, CTAs y rutas mentales entre secciones

### Fase 5
- Refinar scoring de ronda libre con más foco, mejor feedback de guardado y más polish premium

## Criterios de calidad

- Mobile first real, no desktop adaptado
- Uso cómodo con una mano
- Lectura rápida al aire libre
- Menor carga cognitiva posible
- Lo importante debe entenderse en menos de 1 segundo
- Acciones principales siempre obvias
- Errores prevenidos antes de ocurrir
- Estados de carga, éxito y fallo consistentes y premium
- Consistencia visual transversal
- Mantener funcionalidad existente sin romper flujos reales

## Qué evitar

- No hagas refactors cosméticos sin impacto
- No conviertas las pantallas en layouts genéricos
- No metas más información en el fold inicial
- No uses tablas densas como solución por defecto en móvil
- No sacrifiques claridad por “verse moderno”
- No rompas el flujo fuerte de ronda libre

## Entrega esperada

Al final quiero:
- resumen de mejoras implementadas
- validación de que scoring, leaderboard y navegación quedaron más claros en móvil
- riesgos pendientes
- explicación breve de decisiones importantes de UX
```
