# MOBILE UX DEEP FLOW AUDIT

## 1. Resumen ejecutivo

La app sí tiene ADN mobile-first, pero todavía no opera como un producto mobile premium de punta en todos sus procesos críticos. Hoy está en un nivel `bueno pero desigual`: el scoring de ronda libre ya roza una experiencia muy buena, mientras que scoring de torneo, leaderboard, dashboard, historial y navegación todavía mezclan decisiones correctas con patrones más propios de una web funcional que de una app móvil ultra refinada.

Qué tan lejos está de una experiencia premium de verdad:
- En el mejor flujo, `ronda libre / score`, la distancia es corta.
- En el sistema completo, la distancia sigue siendo media.
- En `scoring torneo` y `leaderboard`, la distancia todavía es relevante.

Fortalezas:
- Hay intención mobile real, no solo responsive.
- Existen decisiones ergonómicas buenas en flujos clave: safe areas, botones grandes, sticky CTAs, chips rápidos, feedback de guardado, swipe, haptics y foco en uso desde celular.
- El producto tiene identidad y no se siente genérico.
- La app intenta construir confianza, contexto y emoción, no solo utilidad.

Debilidades:
- La experiencia no es consistente entre flujos.
- Varios procesos siguen apoyándose en tablas, grillas, formularios largos o demasiada información simultánea.
- Hay demasiadas microdecisiones en varios momentos de uso repetitivo.
- La navegación global todavía no se siente como una arquitectura mobile unificada.
- Faltan más señales de control, calma y confirmación en tareas sensibles.

Riesgos más serios para adopción y confianza:
- En `scoring torneo`, el usuario puede sentirse más “operando una consola” que “usando una app premium segura”.
- En `leaderboard`, la consulta frecuente puede cansar o volverse más pesada de lo deseable.
- En `dashboard`, `historial` e `insights`, el valor existe, pero la carga cognitiva sigue siendo demasiado alta para móvil frecuente.
- La inconsistencia entre flujos puede afectar la percepción global de calidad incluso si algunos módulos están muy bien resueltos.

## 2. Mapa completo de rutas y flujos

### Onboarding / acceso

#### `/`
- Propósito: landing y entrada general al producto.
- Acción principal esperada: registrarse, iniciar sesión o explorar valor.
- Frecuencia probable: alta en adquisición, baja en uso recurrente.
- Criticidad UX: media.

#### `/login`
- Propósito: acceso de usuario existente.
- Acción principal esperada: iniciar sesión rápido y con confianza.
- Frecuencia probable: media.
- Criticidad UX: alta.

#### `/register`
- Propósito: alta de usuario.
- Acción principal esperada: crear cuenta con mínima fricción.
- Frecuencia probable: media.
- Criticidad UX: alta.

#### `/auth/auth-code-error`
- Propósito: manejar error de autenticación.
- Acción principal esperada: entender qué pasó y recuperarse.
- Frecuencia probable: baja.
- Criticidad UX: media.

### Home / dashboard

#### `/dashboard`
- Propósito: hub personal del usuario.
- Acción principal esperada: crear ronda, crear torneo, retomar torneos, ver stats, entrar a historial.
- Frecuencia probable: alta.
- Criticidad UX: muy alta.

### Torneos

#### `/organizador/nuevo`
- Submódulo clave: `NuevoTorneoForm.tsx`
- Propósito: crear torneo.
- Acción principal esperada: configurar torneo y pasar a carga de jugadores.
- Frecuencia probable: media.
- Criticidad UX: alta.

#### `/organizador/[slug]/editar`
- Submódulo clave: `EditTorneoForm.tsx`
- Propósito: editar configuración del torneo.
- Acción principal esperada: ajustar torneo sin errores.
- Frecuencia probable: media.
- Criticidad UX: media-alta.

#### `/organizador/[slug]/jugadores`
- Submódulo clave: `JugadoresPanel.tsx`
- Propósito: buscar, inscribir, desinscribir jugadores y lanzar torneo.
- Acción principal esperada: armar field correctamente y pasar a scoring.
- Frecuencia probable: media-alta.
- Criticidad UX: muy alta.

#### `/torneo/[slug]`
- Submódulos relevantes: leaderboard público, share, scorecards expandidas, GWI si aplica.
- Propósito: seguimiento público del torneo.
- Acción principal esperada: entender posiciones y evolución.
- Frecuencia probable: alta.
- Criticidad UX: muy alta.

#### `/torneo/[slug]/score`
- Propósito: scoring jugador simplificado.
- Acción principal esperada: elegir identidad y cargar score.
- Frecuencia probable: media.
- Criticidad UX: alta.

#### `/torneo/[slug]/tv`
- Propósito: leaderboard para vista TV/broadcast.
- Acción principal esperada: visualización pasiva.
- Frecuencia probable: baja.
- Criticidad UX: menor en móvil, alta en contexto evento.

### Scoring torneo

#### `/organizador/[slug]/scoring`
- Submódulos relevantes:
  - selector horizontal de jugadores
  - score grid 9 columnas
  - bloque de totales
  - tabla colapsable de stats extra
  - botón de finalizar ronda
- Propósito: registrar scores oficiales.
- Acción principal esperada: ingresar score por jugador y hoyo con precisión y rapidez.
- Frecuencia probable: muy alta durante torneo.
- Criticidad UX: crítica.

### Ronda libre

#### `/ronda-libre/nueva`
- Propósito: crear ronda libre.
- Acción principal esperada: configurar cancha, modalidad, fecha, jugadores y comenzar.
- Frecuencia probable: alta.
- Criticidad UX: alta.

#### `/ronda-libre/[codigo]`
- Subflujos:
  - elección de rol `jugador` / `espectador`
  - spectator view con timeline, GWI y leaderboard
  - player join list para elegir identidad
  - copy link / cambiar rol
- Propósito: puerta de entrada operacional a la ronda.
- Acción principal esperada: ver o cargar score.
- Frecuencia probable: alta.
- Criticidad UX: muy alta.

#### `/ronda-libre/[codigo]/score`
- Submódulos relevantes:
  - header con estado online/offline, guardado, QR
  - selector de jugador
  - hole hero
  - controles +/-
  - quick chips gross/neto/stableford
  - mini grid de progreso
  - resumen Out/In/Total/Neto/Stableford
  - sticky CTA siguiente/finalizar
  - banner tAIger al finalizar
- Propósito: capturar score móvil en tiempo real.
- Acción principal esperada: registrar score rápido, seguro y sin pensar demasiado.
- Frecuencia probable: muy alta.
- Criticidad UX: crítica.

### Leaderboard

#### `/leaderboard`
- Submódulos relevantes:
  - `LeaderboardTable`
  - `ShareModal`
  - `Scorecard`
  - `ToastStack`
- Propósito: leaderboard broadcast/global.
- Acción principal esperada: mirar, comparar, expandir, compartir.
- Frecuencia probable: media.
- Criticidad UX: alta.

#### `src/components/LeaderboardTable.tsx`
- Propósito: tabla principal, tabs de categoría, accordion por jugador, scorecards, compartir y toasts.
- Acción principal esperada: scan + expand + compartir.
- Frecuencia probable: alta dentro del flujo leaderboard.
- Criticidad UX: muy alta.

#### `src/components/GWILeaderboard.tsx`
- Propósito: probabilidades y lectura “inteligente” del torneo/ronda.
- Acción principal esperada: entender chances y drama competitivo.
- Frecuencia probable: media.
- Criticidad UX: media-alta.

### Perfil

#### `/perfil`
- Propósito: identidad, edición básica y accesos relacionados.
- Acción principal esperada: ver perfil, editar datos, saltar a stats o historial.
- Frecuencia probable: media.
- Criticidad UX: media-alta.

#### `/perfil/stats`
- Propósito: explorar métricas y evolución.
- Acción principal esperada: entender progreso.
- Frecuencia probable: media.
- Criticidad UX: media.

### Historial

#### `/perfil/historial`
- Submódulos relevantes:
  - header con progreso tAIger
  - formulario largo de nueva ronda histórica
  - score inputs por hoyo
  - preview en vivo
  - cards de historial expandibles
- Propósito: registrar rondas históricas y revisar scorecards.
- Acción principal esperada: cargar tarjeta o revisar desempeño pasado.
- Frecuencia probable: media.
- Criticidad UX: alta.

### Insights / GWI / tAIger

#### `/coach`
- Propósito: hub de coach mental.
- Acción principal esperada: entender nivel de análisis, iniciar sesión, ver patrones.
- Frecuencia probable: media.
- Criticidad UX: alta.

#### `/coach/onboarding`
- Propósito: perfilar jugador.
- Acción principal esperada: responder preguntas con baja fricción.
- Frecuencia probable: baja.
- Criticidad UX: media-alta.

#### `/coach/sesion/nueva`
- Propósito: elegir tipo de sesión y, si aplica, ronda a analizar.
- Acción principal esperada: iniciar sesión correcta rápido.
- Frecuencia probable: media.
- Criticidad UX: alta.

#### `/coach/sesion/nueva/chat`
- Propósito: chat operativo con tAIger.
- Acción principal esperada: conversar, recibir respuesta, completar sesión.
- Frecuencia probable: media.
- Criticidad UX: alta.

#### `/coach/sesion/[id]`
- Propósito: revisar y continuar sesión guardada.
- Acción principal esperada: leer, retomar, hacer follow-up.
- Frecuencia probable: media.
- Criticidad UX: media-alta.

### Navegación transversal

#### `src/components/Navbar.tsx`
- Submódulos relevantes:
  - navbar sticky
  - dropdown desktop
  - bottom sheet mobile
- Propósito: descubrimiento y movimiento global.
- Acción principal esperada: saltar entre secciones principales.
- Frecuencia probable: alta.
- Criticidad UX: muy alta.

### Estados transversales

#### `src/components/ui/EmptyState.tsx`
- Propósito: empty states.
- Criticidad UX: media.

#### `src/components/ui/ErrorState.tsx`
- Propósito: error recovery.
- Criticidad UX: alta.

#### `src/components/ui/LoadingSkeleton.tsx`
- Propósito: loading.
- Criticidad UX: media.

#### `src/components/ui/Toast.tsx`
- Propósito: feedback temporal.
- Criticidad UX: alta.

## 3. Auditoría profunda por flujo

### Onboarding / login / registro

#### Propósito
Permitir acceso o alta con mínima fricción y máxima confianza.

#### Usuario esperado
Usuario nuevo o recurrente entrando desde celular, muchas veces desde contexto no ideal.

#### Pasos reales del flujo
1. Llegar desde landing, redirect o acceso directo.
2. Elegir método de acceso.
3. Completar campos o usar proveedor social.
4. Resolver errores.
5. Confirmar entrada.

#### Fortalezas
- Pantallas enfocadas y visualmente cuidadas.
- Jerarquía suficientemente clara para no perder al usuario.
- Estética con identidad.
- Buen punto de partida para una primera impresión premium.

#### Fricciones
- Registro no es tan directo como podría; hay más “estructura” que velocidad.
- El modo plegable de registro agrega una pequeña fricción mental.
- Faltan más señales tranquilizadoras sobre qué pasa después.
- Se siente más bello que brutalmente fácil.

#### Errores probables
- Duda sobre el camino principal si el usuario llega apurado.
- Error de validación con feedback poco memorable.
- Fatiga leve si la persona solo quiere entrar rápido y no interpretar módulos.

#### Puntos de duda
- Qué opción conviene elegir.
- Qué hará la app tras registrarse.
- Qué tan obligatorio es completar ciertas cosas al inicio.

#### Momentos de carga cognitiva
- Inicio del registro.
- Lectura de bloques o subtítulos cuando lo ideal sería ir directo a la acción.

#### Problemas de ergonomía
- Más visual que operativo.
- Bien tocable, pero no particularmente veloz.

#### Oportunidades de mejora
- Simplificar el momento cero.
- Guiar con más fuerza la primera acción.
- Usar microcopy más orientado a certeza.

#### Quick wins
- Reducir textos secundarios.
- Dar más jerarquía al CTA correcto.
- Mejorar feedback de error y éxito.

#### Mejoras estructurales
- Replantear registro para que se sienta lineal, instantáneo y confiable.

#### Nivel actual
- Buena

### Home / dashboard

#### Propósito
Ser el centro de acción principal del usuario recurrente.

#### Usuario esperado
Usuario logueado que quiere actuar rápido: jugar, organizar, seguir, consultar.

#### Pasos reales del flujo
1. Llegar al dashboard.
2. Interpretar qué tarjetas importan.
3. Elegir entre ronda libre, torneo, stats, torneos activos, rondas recientes, etc.
4. Navegar a la siguiente tarea.

#### Fortalezas
- Hay riqueza de producto.
- La app comunica ambición, no solo utilidad básica.
- Existen accesos reales a muchas tareas frecuentes.

#### Fricciones
- Demasiadas secciones con peso similar.
- El usuario debe escanear mucho para decidir.
- El dashboard parece resumir todo, pero no prioriza con suficiente dureza.

#### Errores probables
- Ignorar acciones útiles por ruido visual.
- Hacer scroll innecesario para retomar una tarea obvia.
- Usarlo como “pantalla de paso” y no como centro de control.

#### Puntos de duda
- Qué debería hacer primero.
- Qué es urgente, activo o recomendado.

#### Momentos de carga cognitiva
- Primer viewport.
- Cambio entre “crear”, “seguir”, “ver histórico” y “analizar”.

#### Problemas de ergonomía
- Más scroll y exploración de la ideal.
- Uso a una mano bien tolerado, pero no optimizado para urgencia.

#### Oportunidades de mejora
- Pasar de dashboard “inventario” a dashboard “hoy”.
- Priorizar una acción principal y dos secundarias.
- Reducir carga arriba del fold.

#### Quick wins
- Reordenar bloques por valor inmediato.
- Reducir profundidad del primer viewport.
- Mejorar ritmo visual entre tarjetas.

#### Mejoras estructurales
- Diseñar un home contextual con lógica de “continuar donde quedaste”.

#### Nivel actual
- Correcta a buena

### Creación / ingreso / gestión de torneo

#### Propósito
Crear un torneo, configurarlo, poblarlo con jugadores y dejarlo listo para operar.

#### Usuario esperado
Organizador en móvil, muchas veces resolviendo sobre la marcha.

#### Pasos reales del flujo
1. Entrar a `/organizador/nuevo`.
2. Completar nombre, cancha, formato, hoyos, tees, handicap, categorías, fecha, portada.
3. Guardar torneo.
4. Ir a `/organizador/[slug]/jugadores`.
5. Buscar jugador.
6. Asignar categoría y flight.
7. Inscribir.
8. Repetir hasta completar field.
9. Iniciar torneo.

#### Fortalezas
- El flujo existe de punta a punta.
- Los formularios son bastante ricos y completos.
- Hay intentos correctos de validación y feedback.
- El botón sticky para iniciar torneo tiene buena dirección operativa.

#### Fricciones
- Creación de torneo es larga y muy modular.
- Hay demasiadas decisiones antes de obtener una primera recompensa.
- El alta de jugadores se apoya mucho en dropdowns y tabla posterior.
- La tabla de inscritos y la gestión por flight/categoría se siente más backoffice que mobile premium.

#### Errores probables
- Seleccionar cancha pensando que ya quedó confirmada.
- Cargar categorías o tees con poca confianza.
- Equivocarse de jugador, categoría o flight al inscribir.
- Borrar jugador sin suficiente seguridad psicológica.

#### Puntos de duda
- Qué configuración es realmente importante.
- Qué sucede si faltan datos.
- Si el torneo ya está listo para partir o aún falta algo.

#### Momentos de carga cognitiva
- Formulario inicial completo.
- Búsqueda + selección + categoría + flight.

#### Problemas de ergonomía
- Demasiado formulario de una vez.
- Tablas y listados no del todo optimizados para dedo y rapidez.

#### Oportunidades de mejora
- Introducir más secuencia y menos bloque largo.
- Reforzar confirmaciones visuales.
- Hacer la fase de “armar field” más amigable y menos administrativa.

#### Quick wins
- Mejorar legibilidad y separación de secciones.
- Resaltar más el estado seleccionado en cancha/categoría/flight.
- Dar más feedback inmediato al inscribir.

#### Mejoras estructurales
- Dividir crear torneo en pasos cortos.
- Replantear jugadores como lista/card workflow en lugar de mezcla de buscador y tabla pesada.

#### Nivel actual
- Buena funcionalmente, no premium

### Scoring torneo

#### Propósito
Registrar scores oficiales por jugador y hoyo durante el torneo.

#### Usuario esperado
Organizador o scorer móvil, posiblemente bajo presión, con atención parcial y riesgo alto de error.

#### Pasos reales del flujo
1. Entrar desde dashboard o después de iniciar torneo.
2. Seleccionar jugador desde carrusel horizontal.
3. Interpretar bloque de totales y estado.
4. Ingresar score hoyo por hoyo en grilla.
5. Opcionalmente abrir estadísticas adicionales.
6. Guardar por blur.
7. Finalizar ronda si todos los hoyos están completos.

#### Fortalezas
- Tiene cobertura funcional real.
- Existe contexto del jugador.
- Hay feedback de guardado y estado de ronda.
- Permite complementar con putts/fairway/GIR.

#### Fricciones
- El flujo principal se apoya en una grilla de 9 columnas excesiva para móvil.
- El input depende de foco/blur, poco tranquilizador para tarea sensible.
- La relación entre jugador activo, hoyo activo y estado de carga no es suficientemente dominante.
- Se mezclan captura primaria y stats secundarias dentro de la misma estructura.

#### Errores probables
- Tocar el input incorrecto.
- Creer que guardó cuando aún no está claro.
- Perder contexto de qué hoyo se estaba editando.
- Olvidar un hoyo en medio de la grilla.
- Abrir stats extras y dispersar foco operacional.

#### Puntos de duda
- Qué score fue el último guardado.
- Qué jugador está realmente activo si se navega rápido entre cards.
- Si los totales reflejan el último dato cargado.

#### Momentos de carga cognitiva
- Selección de jugador más interpretación de totales.
- Grilla de scores completa.
- Tabla adicional de stats opcionales.

#### Problemas de ergonomía
- Targets pequeños.
- Mucha precisión motriz requerida.
- Mala compatibilidad con una mano.
- Legibilidad mejorable al sol.

#### Oportunidades de mejora
- Pasar a una experiencia por hoyo o por contexto, no por grilla densa.
- Dar foco brutal al dato que importa ahora.
- Hacer mucho más obvio el guardado, el error y la continuidad.

#### Quick wins
- Aumentar tamaño de celdas.
- Destacar mejor hoyo activo o último editado.
- Separar stats adicionales de la captura principal.
- Hacer más evidente el estado de guardado por hoyo.

#### Mejoras estructurales
- Rediseñar scoring torneo bajo el mismo lenguaje de interacción de ronda libre.

#### Nivel actual
- Correcta

### Ronda libre

#### Propósito
Crear, compartir, seguir e ingresar score de una ronda libre entre amigos.

#### Usuario esperado
Creador, jugador o espectador en entorno móvil real de cancha.

#### Pasos reales del flujo
1. Crear ronda.
2. Compartir código/link.
3. Entrar a `/ronda-libre/[codigo]`.
4. Elegir rol.
5. Como jugador: elegir identidad y pasar a scoring.
6. Como espectador: seguir timeline, leaderboard y GWI.
7. Como scorer: usar `/score`.

#### Fortalezas
- El flujo completo tiene bastante coherencia.
- El entry-point por rol está muy bien pensado.
- El rol reduce ansiedad y ayuda a entrar rápido.
- La vista de jugador y espectador responden a necesidades distintas.

#### Fricciones
- En la creación todavía hay bastante formulario.
- La vista espectador mezcla varias capas de información.
- La entrada a scoring es clara, pero la lista de jugadores podría guiar más la decisión.

#### Errores probables
- Elegir rol incorrecto.
- No entender de inmediato si la ronda está activa o finalizada.
- Dudar si el nombre correcto es el propio.

#### Puntos de duda
- Qué modo de juego aplica.
- Qué cambia entre mirar y cargar.

#### Momentos de carga cognitiva
- Pantalla de rol en usuarios nuevos.
- Vista espectador cuando hay timeline + GWI + leaderboard.

#### Problemas de ergonomía
- Bastante buenos en general.
- La parte más cargada es la vista espectador.

#### Oportunidades de mejora
- Refinar aún más el entry flow.
- Hacer que el espectador entienda todo aún más rápido.
- Mantener la brillantez operativa del scoring y simplificar lo accesorio.

#### Quick wins
- Reforzar más el CTA primario según rol.
- Reducir densidad de módulos en spectator view.

#### Mejoras estructurales
- Definir una primera capa aún más simple para espectador.

#### Nivel actual
- Muy buena como sistema, con desigualdad entre subflujos

### Leaderboard

#### Propósito
Permitir seguir posiciones, contexto competitivo y scorecards.

#### Usuario esperado
Jugador, amigo, organizador o espectador mirando rápido y repetidamente.

#### Pasos reales del flujo
1. Entrar al leaderboard.
2. Entender líder, cantidad en cancha, tabs o estado.
3. Escanear posiciones.
4. Expandir jugador.
5. Leer scorecard.
6. Compartir si aplica.

#### Fortalezas
- Tiene personalidad y narrativa broadcast.
- Busca emoción, no mera tabla.
- Integra scorecards, compartir y señales en vivo.

#### Fricciones
- Sigue siendo table-first en varios puntos.
- La primera lectura todavía exige más esfuerzo del ideal.
- Accordion, scorecards, share y toasts compiten en una misma experiencia.
- La scanability no está al nivel de una app deportiva premium móvil.

#### Errores probables
- Perder rápidamente el contexto de la fila.
- Expandir/contraer sin detectar el cambio.
- Cansarse antes de comparar bien.

#### Puntos de duda
- Quién está realmente subiendo/bajando si no se mira con calma.
- Qué parte de la UI es primaria y qué parte es detalle.

#### Momentos de carga cognitiva
- Primera interpretación de tabla.
- Comparación entre jugadores.
- Lectura de scorecard horizontal.

#### Problemas de ergonomía
- Scroll horizontal implícito o compresión.
- Targets y filas utilizables, pero no especialmente descansadas.

#### Oportunidades de mejora
- Convertir la vista principal en una experiencia más escaneable.
- Hacer sticky el contexto clave.
- Mover lo detallado a disclosure progresivo mejor resuelto.

#### Quick wins
- Aligerar columnas.
- Reforzar separación entre resumen y detalle.
- Priorizar posición, diferencia y hoyo.

#### Mejoras estructurales
- Rediseñar leaderboard alrededor de cards/ranking mobile, no tabla adaptada.

#### Nivel actual
- Buena

### Perfil

#### Propósito
Mostrar identidad, estado y accesos personales.

#### Usuario esperado
Usuario que quiere revisar datos propios y quizá editar algo rápido.

#### Pasos reales del flujo
1. Entrar al perfil.
2. Escanear resumen.
3. Ver métricas rápidas.
4. Editar datos si quiere.
5. Saltar a stats o historial.

#### Fortalezas
- Buena presencia visual.
- Se siente cuidado y consistente con la marca.
- Resume razonablemente bien identidad y contexto.

#### Fricciones
- Mucho contenido con parecido peso visual.
- Más contemplativo que accionable.
- La edición funciona, pero el flujo no se siente particularmente ligero.

#### Errores probables
- No entender qué sección tiene más valor.
- Editar por curiosidad, no porque el flujo invite claramente.

#### Puntos de duda
- Qué hacer desde aquí aparte de mirar.

#### Momentos de carga cognitiva
- Lectura de métricas y “identidad competitiva”.

#### Problemas de ergonomía
- Correctos.
- Mejorable en ritmo vertical y foco.

#### Oportunidades de mejora
- Hacerlo más accionable.
- Reforzar progresión y próximos pasos.

#### Quick wins
- Priorizar mejor bloques.
- Reforzar la separación entre identidad, edición y saltos de acción.

#### Mejoras estructurales
- Convertirlo en perfil-producto y no solo perfil-ficha.

#### Nivel actual
- Buena

### Historial

#### Propósito
Cargar rondas históricas y revisar tarjetas previas.

#### Usuario esperado
Jugador comprometido con seguimiento de desempeño.

#### Pasos reales del flujo
1. Entrar al historial.
2. Leer progreso tAIger.
3. Ver tarjetas existentes o abrir formulario.
4. Completar cancha, tee, fecha, 18 scores, notas.
5. Guardar.
6. Revisar tarjetas en cards expandibles.

#### Fortalezas
- Tiene profundidad y valor real.
- El preview de score en vivo ayuda.
- El progreso tAIger da sentido al esfuerzo.

#### Fricciones
- Formulario muy largo y denso.
- 18 inputs numéricos de una vez es mucho para móvil.
- El supuesto de par 4 y el framing técnico reducen confianza de producto.
- Hay mezcla de carga, consulta y motivación en la misma pantalla.

#### Errores probables
- Cargar score en hoyo equivocado.
- Abandonar la tarea por cansancio.
- No notar un error hasta el final.

#### Puntos de duda
- Cuánto importa completar todo.
- Qué parte del historial genera valor inmediato.

#### Momentos de carga cognitiva
- Bloque completo de scores.
- Header con demasiada densidad informativa.

#### Problemas de ergonomía
- Alta densidad.
- Inputs pequeños y repetitivos.
- Más apto para sesión tranquila que para uso móvil natural.

#### Oportunidades de mejora
- Separar mejor captura y consulta.
- Introducir pasos o bloques.
- Reducir intensidad del formulario.

#### Quick wins
- Mejorar jerarquía del formulario.
- Hacer más fuerte el preview y más liviano el resto.

#### Mejoras estructurales
- Replantear historial como “summary first, input later” o wizard.

#### Nivel actual
- Correcta a buena

### Insights / GWI / tAIger

#### Propósito
Entregar valor analítico y coaching mental.

#### Usuario esperado
Jugador que busca insights y acompañamiento.

#### Pasos reales del flujo
1. Entrar a `/coach`.
2. Entender nivel de análisis y patrones.
3. Elegir nueva sesión.
4. Si es onboarding, responder preguntas.
5. Si es sesión nueva, elegir tipo y posiblemente ronda.
6. Chatear.
7. Revisar sesión guardada.

#### Fortalezas
- Propuesta diferenciadora.
- Flujo completo de coach existe.
- Hay una intención clara de progresión.

#### Fricciones
- Mucha densidad de copy y framing.
- El dashboard del coach prioriza bastante la lógica del sistema sobre el alivio del usuario.
- Chat ocupa bien el espacio, pero se siente más correcto que premium.
- Los límites de sesión y mensajes pueden sentirse duros si el diseño no contiene emocionalmente.

#### Errores probables
- No entender qué sesión conviene iniciar.
- Pensar que el sistema hará más de lo que realmente hace.
- Encontrarse con un límite y sentir corte brusco.

#### Puntos de duda
- Qué valor concreto entrega cada tipo de sesión.
- Qué significa cada nivel o patrón.

#### Momentos de carga cognitiva
- Dashboard coach.
- Onboarding largo.
- Selección de sesión.

#### Problemas de ergonomía
- Táctilmente correcto.
- Cognitivamente más pesado de lo ideal.

#### Oportunidades de mejora
- Simplificar brutalmente la primera capa.
- Convertir más insights en decisiones accionables.
- Humanizar más los límites y estados.

#### Quick wins
- Reducir copy.
- Mejorar jerarquía entre insight principal y secundarios.
- Dar más calidez a los estados de error/límite.

#### Mejoras estructurales
- Replantear coach como producto guiado, no solo panel + chat.

#### Nivel actual
- Correcta

### Navegación transversal

#### Propósito
Dar orientación, descubrimiento y continuidad entre áreas.

#### Usuario esperado
Cualquier usuario móvil navegando repetidamente entre home, torneos, scoring, perfil y coach.

#### Pasos reales del flujo
1. Llegar desde navbar, dashboard o links locales.
2. Navegar entre secciones.
3. Volver atrás o cambiar de área.
4. Mantener orientación del lugar actual.

#### Fortalezas
- Hay menú móvil bottom sheet.
- Hay esfuerzo por cuidar el nav mobile.
- Existen links contextuales en muchas pantallas.

#### Fricciones
- La arquitectura móvil no está unificada a nivel de sistema.
- Muchas pantallas dependen de back links específicos en lugar de una lógica estable.
- Algunas áreas ocultan el navbar, otras resuelven navegación local propia.
- El usuario debe recordar más de lo ideal.

#### Errores probables
- Desorientación suave entre secciones.
- Tener que volver mentalmente al dashboard para retomar.
- Dudar de la ruta natural a scoring/leaderboard/perfil.

#### Puntos de duda
- Cuál es la base del producto.
- Cuáles son las secciones principales permanentes.

#### Momentos de carga cognitiva
- Cambios de contexto entre dashboard, torneo, ronda libre, coach y perfil.

#### Problemas de ergonomía
- Correcta, pero todavía poco natural para app mobile premium.

#### Oportunidades de mejora
- Diseñar una arquitectura móvil estable.
- Unificar headers, backs y CTAs por patrón.

#### Quick wins
- Homogeneizar comportamiento de back.
- Homogeneizar títulos y acciones superiores.

#### Mejoras estructurales
- Definir sistema de navegación móvil persistente de primer nivel.

#### Nivel actual
- Correcta

## 4. Auditoría específica del scoring torneo

### Descomposición paso a paso

#### Etapa 1. Entrada al scoring
- El usuario llega desde dashboard o desde “iniciar torneo”.
- La pantalla comunica “en vivo” y ofrece un link al leaderboard público.
- El contexto del torneo está presente, pero el paso inmediato no está hiperconcentrado.

Problemas concretos:
- El header ya reparte atención entre branding, estado, dashboard y leaderboard.
- Falta una introducción más operativa del tipo “elige jugador y carga hoyo a hoyo”.

#### Etapa 2. Selección de jugador
- Se hace en un carrusel horizontal de cards.
- Cada card muestra iniciales, nombre y estado de ronda.

Qué funciona:
- Fácil detectar que primero hay que elegir jugador.
- Buena idea usar cards y no dropdown.

Problemas:
- El estado de progreso del jugador no es lo bastante dominante.
- Las cards ayudan, pero no convierten al jugador activo en un contexto realmente central.

Riesgos de error:
- Cambiar de jugador sin plena conciencia.
- Perder trazabilidad mental de a quién se estaba editando.

#### Etapa 3. Comprensión del estado actual
- Una vez elegido el jugador, aparece su nombre, handicap, gross, net y vs par.

Qué funciona:
- El resumen intenta dar control.

Problemas:
- El resumen es útil, pero todavía no organiza la tarea.
- No existe un concepto fuerte de “hoyo activo”.
- Se expone una foto completa de la ronda cuando lo urgente es una acción puntual.

Riesgos:
- El usuario mira totales, pero sigue sin tener un foco operacional inequívoco.

#### Etapa 4. Ingreso de score
- La captura se hace sobre una grilla de hasta 18 hoyos presentada en 9 columnas.
- Cada celda tiene hoyo, par e input numérico.
- El guardado ocurre en `onBlur`.

Problemas concretos por etapa:
- Se requiere demasiada precisión táctil.
- La densidad es alta.
- El input por blur reduce sensación de seguridad.
- No hay diferenciación brutal del hoyo en edición.
- La lectura de hoyo/par/score puede ser rápida sentado, pero no excelente caminando o bajo sol.
- La celda es informativa, pero no “comodísima”.

Riesgos de error:
- Tocar el input vecino.
- Salir del campo sin estar seguro de que guardó.
- Completar hoyos fuera de secuencia sin darse cuenta.
- Olvidar un hoyo perdido en la matriz.

#### Etapa 5. Estadísticas adicionales
- Se despliega una tabla adicional de putts, fairway hit y GIR.

Qué funciona:
- El producto cubre profundidad estadística.

Problemas:
- La tabla es aún menos mobile-friendly que la grilla principal.
- Se mezclan dos tareas distintas: score crítico y stats enriquecidas.
- Los toggles Sí/No/— son útiles, pero pequeños y repetitivos.

Riesgos:
- Distraer del score principal.
- Introducir error extra por cansancio o prisa.

#### Etapa 6. Confirmación y finalización
- Hay feedback tipo toast.
- El botón de finalizar aparece solo con todos los hoyos completos.

Qué funciona:
- Se previene finalizar antes de completar.

Problemas:
- El estado “guardado” se siente funcional, no premium.
- El flujo no da una gran sensación de cierre seguro.
- La recuperación ante duda/error no está suficientemente contenida.

### Qué partes del scoring todavía se sienten más “consola” que “producto mobile”
- La grilla 9-columnas.
- La tabla de stats extra.
- La dependencia de inputs numéricos pequeños y blur.
- La lógica de “rellenar scorecard” más que “capturar score”.

### Dónde el usuario podría dudar
- Si el último score quedó guardado.
- Si está editando el jugador correcto.
- Si la ronda ya está lista para finalizar.
- Si el total mostrado ya refleja el último cambio.

### Dónde podría equivocarse
- En la celda de hoyo.
- Al alternar entre jugador y score.
- En putts/fairway/GIR si intenta cargar todo desde móvil.

### Qué parte del flujo genera más fricción
- La captura hoyo a hoyo dentro de la grilla.
- La combinación entre score principal y stats opcionales en la misma sesión visual.

### Problemas de lectura
- Mucho 10px-11px auxiliar.
- Más información simultánea de la necesaria.
- Jerarquía insuficiente entre contexto y acción.

### Problemas de interacción
- Targets relativamente pequeños.
- Precisión alta requerida.
- No optimizado para pulgar.
- Menor seguridad psicológica que ronda libre.

### Mejoras prioritarias
1. Cambiar el modelo principal de captura: de grilla a flujo por hoyo o card por hoyo/jugador.
2. Hacer del hoyo actual el centro absoluto de la interfaz.
3. Convertir guardado y error en señales mucho más claras.
4. Separar estadísticas adicionales del momento de captura principal.
5. Introducir acciones rápidas tipo chips o botones grandes en vez de solo input manual.

### Propuesta conceptual de cómo debería sentirse un scoring premium
- Como una herramienta de cancha, no como una hoja de cálculo.
- Una pantalla donde siempre esté claro:
  - quién es el jugador
  - qué hoyo se está editando
  - cuál es el score actual
  - si quedó guardado
  - qué sigue después
- Debería sentirse:
  - obvio
  - seguro
  - rápido
  - táctil
  - difícil de usar mal

## 5. Auditoría específica del leaderboard mobile

### Scanability
- Hoy es aceptable, pero no excelente.
- La tabla obliga a leer más de lo ideal.
- El ranking se entiende, pero no “de un vistazo premium”.

### Comparación
- Posición y score están presentes, pero comparar varios jugadores exige más trabajo del ideal.
- El accordion ayuda, pero agrega profundidad a una experiencia que ya es densa.

### Fatiga visual
- El sistema tiene identidad, pero también mucha información:
  - tabla
  - tabs
  - toasts
  - legend
  - accordion
  - share
- Para uso repetitivo desde móvil, eso fatiga más de lo deseable.

### Jerarquía
- Hay una primera capa clara, pero todavía demasiado horizontal.
- Posición, diferencia, hoyo y movimiento deberían sentirse más obvios.
- El detalle profundo debería vivir más abajo o en capas mejor separadas.

### Mejora conceptual
- La vista principal debería funcionar como “resumen competitivo premium”.
- La estructura ideal sería:
  - resumen superior muy rápido
  - cards de ranking ultra escaneables
  - contexto sticky
  - detail drill-down suave
- El usuario debería poder:
  - entender quién lidera
  - cuán cerca están los demás
  - cuántos hoyos van
  - detectar cambios
  - expandir solo cuando quiere

## 6. Hallazgos transversales

### Patrones repetidos de fricción
- Exceso de información simultánea.
- Jerarquía insuficientemente agresiva.
- Demasiados formularios largos.
- Uso recurrente de tablas y grids en móvil.
- Feedback correcto pero no completamente tranquilizador.

### Inconsistencias sistémicas
- Headers resueltos de maneras distintas.
- Back behavior poco uniforme.
- Ritmo vertical y densidad dispares.
- Textos secundarios a veces demasiado pequeños.
- Mezcla de interfaces muy pulidas con otras más utilitarias.

### Problemas comunes entre rutas
- Mucha experiencia “completa” en una sola pantalla.
- Poca separación entre información principal y secundaria.
- Falta de progressive disclosure más radical.
- Más valor disponible que valor entregado con facilidad.

### Oportunidades de elevar sensación premium en toda la app
- Unificar sistema de navegación.
- Unificar lenguaje de estados de guardado, carga y error.
- Reforzar contraste y legibilidad outdoor.
- Diseñar más momentos de foco puro.
- Convertir más flujos en secuencias pequeñas y no pantallas densas.

## 7. Top 25 oportunidades de mejora

1. Replantear scoring torneo como flujo por hoyo y no como grilla.
- Flujo afectado: scoring torneo
- Problema actual: consola densa, alto riesgo de error.
- Mejora propuesta: captura centrada en hoyo actual y jugador actual.
- Impacto esperado: enorme mejora en velocidad, confianza y ergonomía.
- Prioridad: crítica

2. Separar score principal de estadísticas adicionales en torneo.
- Flujo afectado: scoring torneo
- Problema actual: dos tareas mezcladas.
- Mejora propuesta: modo principal limpio y stats opcionales posteriores.
- Impacto esperado: menor carga cognitiva.
- Prioridad: crítica

3. Rediseñar leaderboard móvil con lógica card-first.
- Flujo afectado: leaderboard
- Problema actual: demasiado table-first.
- Mejora propuesta: cards competitivas escaneables.
- Impacto esperado: menos fatiga y más comprensión.
- Prioridad: crítica

4. Crear una arquitectura de navegación móvil persistente.
- Flujo afectado: navegación transversal
- Problema actual: sistema heterogéneo.
- Mejora propuesta: patrón estable para secciones principales.
- Impacto esperado: más orientación y menos esfuerzo mental.
- Prioridad: crítica

5. Reordenar dashboard alrededor de “la siguiente mejor acción”.
- Flujo afectado: home/dashboard
- Problema actual: demasiadas opciones con igual peso.
- Mejora propuesta: priorización contextual.
- Impacto esperado: más uso recurrente y claridad.
- Prioridad: alta

6. Reducir densidad del primer viewport en dashboard.
- Flujo afectado: home/dashboard
- Problema actual: demasiados bloques arriba.
- Mejora propuesta: limpiar fold inicial.
- Impacto esperado: rapidez percibida.
- Prioridad: alta

7. Hacer más visible el estado de guardado en scoring de ronda libre.
- Flujo afectado: ronda libre score
- Problema actual: guardado correcto, pero algo sutil.
- Mejora propuesta: señales más claras y tranquilizadoras.
- Impacto esperado: más confianza.
- Prioridad: alta

8. Crear modo ultra focus en scoring de ronda libre.
- Flujo afectado: ronda libre score
- Problema actual: aún hay elementos secundarios.
- Mejora propuesta: reducir ruido durante captura.
- Impacto esperado: experiencia premium diferencial.
- Prioridad: alta

9. Mejorar legibilidad al aire libre.
- Flujo afectado: transversal
- Problema actual: labels y secundarios pequeños.
- Mejora propuesta: subir contraste y tamaño útil.
- Impacto esperado: menos errores y más confort.
- Prioridad: alta

10. Replantear ingreso de jugadores a torneo como flujo más guiado.
- Flujo afectado: gestión de torneo
- Problema actual: buscador + selects + tabla se siente administrativo.
- Mejora propuesta: cards y confirmaciones más humanas.
- Impacto esperado: menos errores y más velocidad.
- Prioridad: alta

11. Simplificar la vista espectador de ronda libre.
- Flujo afectado: ronda libre spectator
- Problema actual: timeline + GWI + leaderboard compiten.
- Mejora propuesta: capas más claras.
- Impacto esperado: comprensión inmediata.
- Prioridad: alta

12. Mejorar entrada por rol en ronda libre con más certeza contextual.
- Flujo afectado: ronda libre entry
- Problema actual: buena, pero aún mejorable.
- Mejora propuesta: reforzar consecuencias y CTA.
- Impacto esperado: menos duda.
- Prioridad: media-alta

13. Reestructurar historial como flujo menos denso.
- Flujo afectado: historial
- Problema actual: 18 inputs y mucha carga.
- Mejora propuesta: wizard, pasos o captura progresiva.
- Impacto esperado: más finalización.
- Prioridad: alta

14. Separar mejor consulta y carga en historial.
- Flujo afectado: historial
- Problema actual: todo convive en la misma experiencia.
- Mejora propuesta: summary first, form second.
- Impacto esperado: menor cansancio.
- Prioridad: alta

15. Hacer perfil más accionable.
- Flujo afectado: perfil
- Problema actual: más ficha que centro de acción.
- Mejora propuesta: próximo paso claro y bloques con propósito.
- Impacto esperado: más utilidad percibida.
- Prioridad: media

16. Bajar densidad conceptual del coach dashboard.
- Flujo afectado: coach
- Problema actual: mucho framing y explicación.
- Mejora propuesta: priorizar insight principal y CTA.
- Impacto esperado: más claridad.
- Prioridad: media-alta

17. Dar más calidez y contención a límites y errores en tAIger.
- Flujo afectado: coach chat y sesiones
- Problema actual: cortes funcionales pero algo bruscos.
- Mejora propuesta: mensajes y recovery más premium.
- Impacto esperado: menor frustración.
- Prioridad: media

18. Unificar visualmente headers y acciones superiores.
- Flujo afectado: transversal
- Problema actual: demasiadas variantes.
- Mejora propuesta: patrón visual común.
- Impacto esperado: coherencia premium.
- Prioridad: alta

19. Unificar CTAs primarios y secundarios.
- Flujo afectado: transversal
- Problema actual: estilos y jerarquías irregulares.
- Mejora propuesta: sistema consistente.
- Impacto esperado: más claridad.
- Prioridad: alta

20. Reforzar pressed, selected y active states.
- Flujo afectado: transversal
- Problema actual: buenos en algunos sitios, flojos en otros.
- Mejora propuesta: feedback táctil consistente.
- Impacto esperado: sensación premium.
- Prioridad: media

21. Mejorar empty states con orientación más útil.
- Flujo afectado: transversal
- Problema actual: varios son correctos pero simples.
- Mejora propuesta: CTAs y contexto más fuertes.
- Impacto esperado: menos abandono.
- Prioridad: media

22. Mejorar loading states para que reduzcan ansiedad.
- Flujo afectado: transversal
- Problema actual: varios loaders muy básicos.
- Mejora propuesta: skeletons más contextuales.
- Impacto esperado: mejor velocidad percibida.
- Prioridad: media

23. Hacer más evidente la continuidad entre torneo, scoring y leaderboard.
- Flujo afectado: torneos
- Problema actual: transiciones buenas pero no fluidas al máximo.
- Mejora propuesta: arquitectura conectada.
- Impacto esperado: menor fricción.
- Prioridad: alta

24. Optimizar formularios largos para una mano.
- Flujo afectado: creación torneo, edición torneo, ronda libre nueva, historial
- Problema actual: pantallas largas con varias decisiones.
- Mejora propuesta: bloques más cortos y secuenciados.
- Impacto esperado: más finalización.
- Prioridad: alta

25. Crear lenguaje premium de guardado, éxito y cierre.
- Flujo afectado: scoring, formularios, coach
- Problema actual: feedback funcional, no memorable.
- Mejora propuesta: sistema de confirmaciones sobrio y seguro.
- Impacto esperado: confianza transversal.
- Prioridad: media-alta

## 8. Quick wins

- Subir tamaño y contraste de textos secundarios en scoring, leaderboard e historial.
- Hacer más obvio el guardado en los flujos de score.
- Reforzar el estado activo del jugador actual y del hoyo actual.
- Aligerar el primer viewport del dashboard.
- Unificar visualmente headers y back links.
- Reducir protagonismo de módulos secundarios en ronda libre score.
- Mejorar separación entre información primaria y secundaria en leaderboard.
- Dar más claridad a mensajes de límite o error en coach.
- Hacer más legibles chips, badges y pills en condiciones de lectura rápida.
- Homogeneizar CTAs primarios y secundarios.

## 9. Mejoras estructurales

- Rediseñar scoring torneo como flujo mobile nativo.
- Rediseñar leaderboard mobile con sistema card-first y contexto sticky.
- Crear una arquitectura de navegación móvil persistente.
- Reorganizar dashboard con lógica contextual.
- Replantear historial como flujo de captura más progresivo.
- Simplificar coach para que el valor sea más inmediato y menos explicativo.
- Establecer un sistema visual transversal consistente en spacing, jerarquía y estados.

## 10. Detalles premium

- Animaciones discretas de confirmación al guardar score.
- Señales de “todo bien” más calmadas y elegantes.
- Skeletons contextuales por tipo de pantalla.
- Estados pressed con sensación táctil más rica.
- Más uso de sticky context en ranking y scoring.
- Mejor ritmo vertical entre secciones.
- Badges más consistentes.
- Jerarquías tipográficas más firmes para lectura en 1 segundo.
- Transiciones de expand/collapse más suaves y legibles.
- Feedback emocional más sobrio en éxitos y cierres.

## 11. Riesgos UX si se lanza hoy

- Usuarios nuevos podrían percibir un producto con gran potencial pero todavía irregular.
- El flujo de scoring de torneo puede ser el principal punto de pérdida de confianza operativa.
- El leaderboard puede resultar más cansador de lo ideal para seguimiento frecuente.
- El dashboard puede no conducir con suficiente fuerza a la acción clave.
- Historial e insights pueden sentirse más exigentes que gratificantes desde móvil.
- La experiencia premium quedaría sostenida por algunos módulos, pero no por el sistema completo.

## 12. Backlog para Claude

### Crítico

#### 1. Rediseñar scoring torneo para uso real en cancha
- Flujo afectado: scoring torneo
- Problema que resuelve: densidad, error, baja ergonomía.
- Por qué importa: es el corazón operativo más frágil hoy.
- Impacto esperado: enorme mejora en confianza y velocidad.
- Tipo de mejora: flujo, ergonomía, confianza

#### 2. Rediseñar leaderboard mobile
- Flujo afectado: leaderboard
- Problema que resuelve: fatiga visual y comparación pesada.
- Por qué importa: es un flujo de consulta recurrente y emocionalmente central.
- Impacto esperado: más engagement y más claridad.
- Tipo de mejora: flujo, visual, jerarquía

#### 3. Definir arquitectura de navegación móvil
- Flujo afectado: navegación transversal
- Problema que resuelve: inconsistencia y desorientación suave.
- Por qué importa: afecta todo el producto.
- Impacto esperado: sensación de app madura.
- Tipo de mejora: navegación, consistencia

### Alto impacto

#### 4. Reestructurar dashboard como centro de acción
- Flujo afectado: dashboard
- Problema que resuelve: exceso de opciones sin prioridad clara.
- Por qué importa: condiciona adopción y uso recurrente.
- Impacto esperado: menos carga cognitiva.
- Tipo de mejora: flujo, jerarquía

#### 5. Elevar scoring de ronda libre a nivel premium final
- Flujo afectado: ronda libre score
- Problema que resuelve: aún hay ruido y feedback mejorable.
- Por qué importa: ya es el mejor flujo y debe ser referencia.
- Impacto esperado: experiencia memorable.
- Tipo de mejora: flujo, microinteracción, confianza

#### 6. Replantear historial para móvil
- Flujo afectado: historial
- Problema que resuelve: carga excesiva.
- Por qué importa: hoy limita utilidad recurrente.
- Impacto esperado: más registro y menos abandono.
- Tipo de mejora: flujo, ergonomía

#### 7. Simplificar y priorizar coach
- Flujo afectado: coach / sesiones
- Problema que resuelve: densidad conceptual y fricción emocional.
- Por qué importa: es diferencial de producto.
- Impacto esperado: más valor percibido.
- Tipo de mejora: claridad, confianza, flujo

### Premium / polish

#### 8. Normalizar sistema visual transversal
- Flujo afectado: transversal
- Problema que resuelve: inconsistencia entre pantallas.
- Por qué importa: construye percepción premium.
- Impacto esperado: coherencia alta.
- Tipo de mejora: visual, consistencia

#### 9. Mejorar estados y feedback operativos
- Flujo afectado: scoring, formularios, coach
- Problema que resuelve: señal insuficiente de control.
- Por qué importa: reduce ansiedad y error.
- Impacto esperado: más tranquilidad.
- Tipo de mejora: microinteracción, confianza

#### 10. Optimizar legibilidad outdoor
- Flujo afectado: transversal
- Problema que resuelve: lectura difícil en contexto real.
- Por qué importa: el producto vive en cancha.
- Impacto esperado: menos esfuerzo visual y más precisión.
- Tipo de mejora: accesibilidad útil, ergonomía

## 13. Prompt final para Claude

```md
Quiero que revises el informe `docs/MOBILE_UX_DEEP_FLOW_AUDIT_2026-03-17.md` y luego propongas e implementes mejoras concretas de UX mobile sobre este proyecto.

## Contexto

Producto:
App web mobile-first de golf con foco en torneos, scoring, leaderboard, historial e insights/coach.

Stack:
- Next.js 14
- TypeScript
- Tailwind
- Supabase

Objetivo:
Llevar la UX móvil a un estándar claramente premium, especialmente en uso real de cancha: una mano, atención parcial, velocidad, confianza y baja tolerancia al error.

## Prioridades absolutas

1. Scoring torneo
2. Leaderboard mobile
3. Navegación móvil transversal
4. Dashboard/home
5. Refinamiento premium del scoring de ronda libre

## Diagnóstico base

- El producto ya tiene intención mobile-first real, pero la calidad UX es desigual entre flujos.
- El scoring de ronda libre es el mejor benchmark interno y debe servir como referencia.
- El scoring de torneo hoy se siente demasiado cercano a una consola o scorecard densa, no a una herramienta móvil premium.
- El leaderboard sigue demasiado apoyado en tablas y exige más esfuerzo del ideal en celular.
- El dashboard tiene demasiados bloques con prioridad similar.
- La navegación global todavía no se siente como una arquitectura mobile unificada.
- Historial e insights son valiosos pero demasiado densos para uso frecuente cómodo.

## Qué hacer primero

### Fase 1
- Rediseñar scoring torneo con criterio mobile nativo
- Priorizar jugador activo, hoyo activo, score actual, guardado visible y continuidad clara
- Evitar que la grilla o tabla sea el patrón principal

### Fase 2
- Rediseñar leaderboard mobile para scanability
- Priorizar comparación rápida, sticky context y detalle progresivo

### Fase 3
- Unificar arquitectura de navegación móvil
- Normalizar headers, back behavior y accesos frecuentes

### Fase 4
- Reestructurar dashboard para que priorice la siguiente mejor acción

### Fase 5
- Refinar scoring de ronda libre con más foco, mejor feedback y polish premium

## Criterios de calidad

- Mobile first real
- Uso cómodo con una mano
- Lectura rápida al aire libre
- Menor carga cognitiva posible
- Lo importante debe entenderse en menos de un segundo
- Acciones principales siempre obvias
- Prevención de errores antes de ocurrir
- Confirmaciones y estados de guardado premium
- Consistencia visual transversal
- No romper flujos existentes que hoy funcionan bien

## Qué evitar

- No hagas refactors masivos sin impacto
- No conviertas la app en un diseño genérico
- No agregues más información al primer viewport
- No uses tablas densas como solución por defecto en móvil
- No rompas el flujo fuerte de ronda libre
- No hagas cambios cosméticos sin resolver primero problemas operativos reales

## Entrega esperada

Cuando termines:
- resume qué mejoras aplicaste
- explica cómo mejoró scoring torneo
- explica cómo mejoró leaderboard mobile
- explica cómo quedó la arquitectura de navegación
- lista riesgos UX que aún queden pendientes
```
