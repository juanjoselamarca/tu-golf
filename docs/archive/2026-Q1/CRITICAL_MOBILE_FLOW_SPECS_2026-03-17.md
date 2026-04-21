# CRITICAL MOBILE FLOW SPECS

## 1. Resumen ejecutivo

Los flujos más críticos del producto hoy son:
- scoring torneo
- leaderboard mobile
- navegación mobile transversal
- dashboard/home
- scoring ronda libre
- historial

Los que están más lejos de un nivel premium:
- scoring torneo
- leaderboard mobile
- navegación transversal
- historial

Los que hoy ya sirven como benchmark interno:
- scoring de ronda libre, especialmente en `/ronda-libre/[codigo]/score`

Razón estratégica:
- `scoring torneo` es el mayor riesgo operativo.
- `leaderboard` es el mayor riesgo de fatiga y percepción de producto.
- `navegación` y `dashboard` condicionan todo el sistema.
- `ronda libre score` demuestra que el producto ya sabe resolver bien un flujo móvil cuando concentra foco, tamaño de targets, continuidad y feedback.

## 2. Matriz de flujos críticos

| Flujo | Ruta principal | Frecuencia probable | Criticidad | Nivel actual | Prioridad de rediseño |
|---|---|---:|---|---|---|
| Scoring torneo | `/organizador/[slug]/scoring` | Muy alta | Crítica | Correcta | Máxima |
| Leaderboard mobile | `/torneo/[slug]`, `/leaderboard` | Alta | Muy alta | Buena | Muy alta |
| Navegación mobile transversal | `Navbar`, rutas core | Muy alta | Muy alta | Correcta | Muy alta |
| Dashboard / home operativo | `/dashboard` | Alta | Muy alta | Correcta a buena | Alta |
| Scoring ronda libre | `/ronda-libre/[codigo]/score` | Muy alta | Crítica | Muy buena | Alta como refinamiento |
| Historial | `/perfil/historial` | Media | Alta | Correcta a buena | Alta |

## 3. Especificación detallada por flujo

### Scoring torneo

#### Rutas involucradas
- `/organizador/[slug]/jugadores`
- `/organizador/[slug]/scoring`
- `/torneo/[slug]`

#### Objetivo del usuario
Registrar scores oficiales rápido, sin errores y con sensación de control total.

#### Mapa del flujo actual paso a paso
1. El usuario llega desde dashboard o desde “Iniciar torneo”.
2. Entra a una pantalla con header, link al leaderboard y carrusel de jugadores.
3. Selecciona un jugador.
4. Ve un resumen superior con gross/net/vs par.
5. Ingresa score hoyo a hoyo en una grilla de 9 columnas.
6. El sistema guarda al salir del input.
7. Opcionalmente abre “Estadísticas adicionales”.
8. Si todos los hoyos están completos, aparece “Finalizar ronda”.
9. El usuario finaliza y vuelve al estado general.

#### Fricciones exactas por paso

##### Paso 1: entrada
- Fricción: la pantalla abre con demasiado contexto y poca direccionalidad operacional.
- Qué la provoca: header con varios focos simultáneos.
- Error o duda: el usuario no entra en “modo captura” inmediatamente.
- Impacto: baja velocidad mental de arranque.

##### Paso 2: selección de jugador
- Fricción: el jugador activo no domina suficiente la pantalla.
- Qué la provoca: cards correctas pero no jerarquizadas como contexto principal.
- Error o duda: cambiar de jugador sin plena conciencia.
- Impacto: riesgo de editar a la persona equivocada.

##### Paso 3: lectura del estado
- Fricción: el resumen superior es informativo, pero no guía la acción.
- Qué la provoca: métricas agregadas antes de un foco claro de captura.
- Error o duda: no queda claro cuál es el hoyo “de trabajo”.
- Impacto: más carga cognitiva.

##### Paso 4: ingreso de score
- Fricción: la grilla exige precisión alta.
- Qué la provoca: 9 columnas, inputs pequeños, par e identificadores comprimidos.
- Error o duda: tocar la celda vecina, olvidar qué hoyo se estaba editando.
- Impacto: riesgo operativo directo.

##### Paso 5: guardado
- Fricción: guardar por blur no es psicológicamente seguro.
- Qué la provoca: falta de confirmación contundente por hoyo.
- Error o duda: “¿quedó guardado o no?”.
- Impacto: desconfianza y repetición innecesaria.

##### Paso 6: stats adicionales
- Fricción: el flujo principal se contamina con una tarea secundaria.
- Qué la provoca: tabla colapsable aún más densa que la grilla principal.
- Error o duda: mezclar score crítico con enriquecimiento opcional.
- Impacto: dispersión, cansancio y error.

##### Paso 7: finalización
- Fricción: cierre funcional, poco ceremonial y poco tranquilizador.
- Qué la provoca: falta de una etapa clara de revisión o confirmación fuerte.
- Error o duda: miedo a cerrar con algo mal cargado.
- Impacto: pérdida de confianza.

#### Errores probables
- Score cargado en hoyo incorrecto.
- Cambio de jugador sin advertirlo.
- Score no guardado aunque parezca guardado.
- Ronda finalizada con una duda residual.
- Stats opcionales cargadas de forma inconsistente.

#### Estados y edge cases

##### Estado normal
- Correcto, pero demasiado denso.
- Falta foco dominante.

##### Loading
- Mínimo y suficientemente funcional.
- No comunica contexto operacional.

##### Empty
- Si no hay jugadores, la salida está clara.
- Está bien resuelto, aunque podría dar más certeza sobre el siguiente paso.

##### Error
- Hay toasts y marcación de error por hoyo.
- El sistema avisa, pero no “abraza” el error; sigue sintiéndose técnico-operativo.

##### Éxito
- Existe toast de guardado.
- Es demasiado sutil para la sensibilidad del flujo.

##### Guardado
- El guardado global existe.
- Falta un estado local inequívoco por celda o por hoyo.

##### Edición / corrección
- Posible, pero no especialmente cómoda.
- Corregir implica volver a encontrar celda y repetir patrón poco táctil.

##### Reingreso al flujo
- Se puede volver, pero el sistema no parece pensado para retomar exactamente “dónde estabas”.

##### Edge cases importantes
- Cambio rápido entre jugadores.
- Mala conectividad o retraso en guardado.
- Organización a una mano mientras se camina.
- Ronda casi completa con un hoyo faltante perdido en la grilla.

#### Evaluación en contexto real
- Una mano: deficiente para estándar premium.
- Caminando: débil.
- Atención parcial: débil.
- Bajo sol: mejorable.
- Con apuro: frágil.
- Uso recurrente: funcional, pero cansador.

#### Cómo debería ser el flujo ideal
- La pantalla debe tener un único foco: `jugador activo + hoyo activo + score activo`.
- El hoyo actual debe dominar visualmente.
- El jugador activo debe quedar fijo o claramente persistente.
- La captura debe suceder con botones grandes o selección rápida, no depender principalmente de input pequeño.
- El guardado debe confirmarse de forma visible y calmante.
- Las estadísticas adicionales deben vivir en una capa separada o secundaria.
- La finalización debe sentirse segura, con revisión mínima o señal de “todo completo”.

Qué domina visualmente:
- jugador activo
- hoyo activo
- score actual
- estado de guardado

Qué queda secundario:
- totales agregados
- navegación al leaderboard
- datos secundarios

Qué se oculta progresivamente:
- stats extra
- detalle histórico
- comparativas no esenciales

Qué se confirma:
- score guardado
- hoyo completado
- cambio de jugador
- ronda finalizada

Qué se fija sticky:
- jugador activo
- hoyo actual
- CTA principal siguiente/finalizar

Cómo se minimiza el error:
- targets grandes
- menos elementos simultáneos
- contexto fijo
- confirmación por paso
- separación entre captura y enriquecimiento

#### Quick wins
- Resaltar más el jugador activo.
- Hacer visible el hoyo editado o último editado.
- Separar visualmente la tabla de stats extra del score principal.
- Reforzar guardado con una señal local más fuerte.
- Reducir el peso visual del header.

#### Rediseños medianos
- Cambiar la grilla a cards de hoyo más grandes.
- Introducir navegación por hoyo con control lateral o secuencial.
- Mover stats extra a un segundo paso o panel separado.
- Añadir barra sticky con jugador, hoyo y estado.

#### Rediseños estructurales
- Rehacer scoring torneo usando la arquitectura de interacción de ronda libre.
- Diseñar “modo captura” dedicado y “modo revisión” separado.
- Eliminar la dependencia principal de la tabla densa.

### Leaderboard mobile

#### Rutas involucradas
- `/torneo/[slug]`
- `/leaderboard`
- `src/components/LeaderboardTable.tsx`
- `src/components/GWILeaderboard.tsx`

#### Objetivo del usuario
Entender rápido quién lidera, cómo están los demás y qué cambió, con mínimo esfuerzo.

#### Mapa del flujo actual paso a paso
1. El usuario entra al leaderboard.
2. Ve header broadcast con estado general.
3. Interactúa con tabs o categorías.
4. Escanea tabla.
5. Toca una fila para expandir scorecard.
6. Revisa detalle.
7. Opcionalmente comparte.

#### Fricciones exactas por paso

##### Paso 1: entrada
- Fricción: la experiencia tiene identidad, pero no resume con suficiente agresividad.
- Qué la provoca: varios elementos interesantes compiten desde el inicio.
- Error o duda: cuesta decidir qué mirar primero.
- Impacto: más tiempo hasta comprender la situación.

##### Paso 2: scan inicial
- Fricción: el patrón sigue siendo table-first.
- Qué la provoca: columnas, estructura horizontal, información compactada.
- Error o duda: comparar varios jugadores requiere más trabajo del ideal.
- Impacto: fatiga visual.

##### Paso 3: tabs y categorías
- Fricción: útiles, pero añaden una capa más de control sobre una vista ya exigente.
- Qué la provoca: contenido con varios ejes de lectura.
- Error o duda: qué vista conviene para responder la pregunta actual.
- Impacto: fricción leve pero constante.

##### Paso 4: expansión de scorecard
- Fricción: el accordion baja la información, pero no necesariamente la hace más fácil.
- Qué la provoca: detalle horizontal y scorecards miniaturizadas.
- Error o duda: pérdida de contexto de la fila original.
- Impacto: seguimiento menos natural.

##### Paso 5: compartir y toasts
- Fricción: agregan riqueza, pero también capas simultáneas.
- Qué la provoca: varias funciones conviviendo en una misma vista.
- Error o duda: la UI se siente más ocupada de lo ideal.
- Impacto: menor calma visual.

#### Errores probables
- Leer mal qué jugador está más cerca del líder.
- No detectar de inmediato hoyo/estado.
- Expandir una fila y cansarse antes de entender el detalle.

#### Estados y edge cases

##### Estado normal
- Rico visualmente.
- Todavía más denso de lo premium.

##### Loading
- Existe overlay o loaders funcionales.
- Correcto, no especialmente refinado.

##### Empty
- Adecuado.
- Podría guiar más si no hay datos.

##### Error
- No es el punto más débil, pero tampoco es un área con contención premium fuerte.

##### Éxito
- Compartir funciona, pero el feedback no es especialmente memorable.

##### Reingreso
- El usuario vuelve a una vista larga y exigente; faltan anclas más fuertes.

##### Edge cases importantes
- Muchos jugadores.
- Consultas repetitivas y rápidas.
- Usuario mirando desde afuera de la cancha.
- Necesidad de comparar sin detenerse demasiado.

#### Evaluación en contexto real
- Una mano: aceptable, no excelente.
- Caminando: mejorable.
- Atención parcial: media.
- Bajo sol: mejorable.
- Con apuro: más lenta de lo ideal.
- Uso recurrente: puede fatigar.

#### Cómo debería ser el flujo ideal
- El primer viewport debe resolver:
  - líder
  - diferencia
  - hoyo/estado
  - top rivalidad
- La capa principal debe ser ranking ultra escaneable, no tabla densa.
- El detalle debe abrirse con menor costo cognitivo.
- La comparación debe sentirse casi automática.

Qué domina visualmente:
- posición
- score vs líder
- hoyo actual o status

Qué queda secundario:
- metadata
- scorecards completas
- leyendas
- share avanzado

Qué se oculta progresivamente:
- detalle hoyo a hoyo
- breakdowns extra
- opciones secundarias

Qué se fija sticky:
- contexto de torneo
- filtros principales
- líder/resumen

Cómo se minimiza el error:
- menos columnas
- más bloques verticales
- mejor separación entre resumen y detalle

#### Quick wins
- Reducir densidad de columnas.
- Reforzar visualmente líder, diferencia y hoyo.
- Simplificar la primera capa antes del accordion.
- Dar más separación entre tabla y scorecard.

#### Rediseños medianos
- Migrar a filas-card más verticales.
- Añadir contexto sticky.
- Reestructurar el accordion para que el detalle sea más legible.

#### Rediseños estructurales
- Rehacer leaderboard mobile como experiencia card-first de competencia en vivo.

### Navegación mobile transversal

#### Rutas involucradas
- `src/components/Navbar.tsx`
- `/dashboard`
- `/torneo/[slug]`
- `/ronda-libre/[codigo]`
- `/coach`
- `/perfil`

#### Objetivo del usuario
Encontrar rápido áreas principales, volver sin pensar y moverse sin perderse.

#### Mapa del flujo actual paso a paso
1. El usuario entra desde landing o dashboard.
2. Navega mediante menú, links contextuales o back links propios de cada pantalla.
3. Cambia entre dashboard, rondas, torneos, perfil y coach.
4. Repite esta lógica en distintas secciones.

#### Fricciones exactas por paso

##### Paso 1: descubrimiento
- Fricción: no siempre queda claro cuál es la arquitectura base del producto.
- Qué la provoca: mezcla de navegación global y navegación local.
- Error o duda: “¿cuáles son las secciones principales de verdad?”.
- Impacto: más memoria que reconocimiento.

##### Paso 2: cambio entre áreas
- Fricción: cada zona resuelve headers y returns de forma distinta.
- Qué la provoca: patrones locales heterogéneos.
- Error o duda: el usuario debe reaprender pequeñas convenciones.
- Impacto: fricción suave, pero sistémica.

##### Paso 3: volver atrás
- Fricción: los back links existen, pero no forman un sistema estable.
- Qué la provoca: dependencia de rutas concretas y links situacionales.
- Error o duda: cuesta anticipar qué pasará al volver.
- Impacto: menor sensación de control.

##### Paso 4: acceso a acciones frecuentes
- Fricción: ciertas acciones viven en dashboard; otras en menú; otras en links internos.
- Qué la provoca: falta de un “home base” móvil fuerte.
- Error o duda: encontrar lo recurrente implica más exploración de la ideal.
- Impacto: menor eficiencia.

#### Errores probables
- Volver al lugar incorrecto.
- Entrar al flujo correcto por una ruta larga.
- Perder orientación entre torneo, score y perfil.

#### Estados y edge cases

##### Estado normal
- Funcional.
- Inconsistente entre áreas.

##### Loading
- No crítico aquí.

##### Empty
- Aplica menos, salvo menús o rutas sin contenido.

##### Error
- La navegación no falla mucho, pero puede sentirse poco confiable por heterogeneidad.

##### Reingreso
- El reingreso depende mucho de recordar dónde estaba el usuario.

##### Edge cases importantes
- Usuario alternando rápido entre score y leaderboard.
- Usuario entrando desde link compartido.
- Usuario nuevo sin modelo mental del producto.

#### Evaluación en contexto real
- Una mano: aceptable.
- Caminando: aceptable pero mejorable.
- Atención parcial: media.
- Bajo sol: correcto si los elementos están claros.
- Con apuro: mejorable por falta de arquitectura obvia.
- Uso recurrente: la inconsistencia se hace más visible.

#### Cómo debería ser el flujo ideal
- Debe existir una arquitectura móvil evidente con secciones principales persistentes.
- Los headers deben seguir un lenguaje común.
- El usuario debe reconocer siempre:
  - dónde está
  - qué puede hacer
  - cómo volver

Qué domina visualmente:
- título de contexto
- acción principal
- patrón de back consistente

Qué queda secundario:
- acciones accesorias
- links menos usados

Qué se fija sticky:
- navegación principal o superior según flujo

Cómo se minimiza el error:
- menos variantes de header
- menos decisiones sobre “cómo navegar”
- más reconocimiento, menos memoria

#### Quick wins
- Unificar headers.
- Unificar back labels y comportamiento.
- Homogeneizar ubicación de acciones primarias.

#### Rediseños medianos
- Definir sistema único de navegación top-level.
- Reordenar accesos frecuentes según frecuencia real.

#### Rediseños estructurales
- Construir una arquitectura mobile completa y estable del producto.

### Dashboard / home

#### Rutas involucradas
- `/dashboard`

#### Objetivo del usuario
Retomar rápido la acción correcta sin pensar demasiado.

#### Mapa del flujo actual paso a paso
1. El usuario entra.
2. Ve saludo, actions cards, stats, torneos propios, torneos jugados, rondas libres, métricas.
3. Escanea todo.
4. Decide manualmente qué sigue.

#### Fricciones exactas por paso

##### Paso 1: primer viewport
- Fricción: muchos bloques valiosos compiten de inmediato.
- Qué la provoca: dashboard más descriptivo que priorizado.
- Error o duda: “¿qué debería hacer ahora?”.
- Impacto: carga cognitiva innecesaria.

##### Paso 2: exploración
- Fricción: el usuario debe leer varias secciones para llegar a la importante.
- Qué la provoca: secuencia larga y poco contextual.
- Error o duda: la próxima acción no está prescrita.
- Impacto: menor velocidad de uso recurrente.

##### Paso 3: ejecución
- Fricción: los caminos existen, pero no están jerarquizados por intención real.
- Qué la provoca: demasiadas opciones al mismo nivel.
- Error o duda: iniciar una acción útil o perderla en el scroll.
- Impacto: menor activación.

#### Errores probables
- Ir primero a una sección menos importante.
- Ignorar un torneo activo o una ronda reciente.
- Usar dashboard solo como lista de links.

#### Estados y edge cases

##### Estado normal
- Rico.
- Cargado.

##### Loading
- No es el mayor problema, pero podría ser más claro.

##### Empty
- Los empty states están razonablemente bien.
- Falta una narrativa más fuerte de “qué hacer ahora”.

##### Reingreso
- Correcto, pero sin lógica de continuidad clara.

##### Edge cases importantes
- Usuario con torneos activos y rondas recientes al mismo tiempo.
- Usuario nuevo versus usuario muy recurrente.

#### Evaluación en contexto real
- Una mano: correcta.
- Caminando: mejorable por longitud.
- Atención parcial: media.
- Bajo sol: aceptable.
- Con apuro: más lenta de lo ideal.
- Uso recurrente: más scroll del necesario.

#### Cómo debería ser el flujo ideal
- Dashboard como centro de acción, no inventario.
- Primera capa:
  - siguiente mejor acción
  - estado actual
  - acceso rápido a lo activo
- Lo histórico y secundario después.

Qué domina visualmente:
- CTA principal contextual
- contenido activo

Qué queda secundario:
- métricas
- histórico largo
- elementos aspiracionales

Qué se oculta progresivamente:
- secciones menos frecuentes
- detalles organizacionales

#### Quick wins
- Reordenar bloques.
- Hacer más breve el fold inicial.
- Diferenciar mejor primario vs secundario.

#### Rediseños medianos
- Crear módulos por contexto: “seguir”, “jugar”, “organizar”.
- Dar más peso a acciones activas y menos a listados pasivos.

#### Rediseños estructurales
- Rediseñar dashboard con lógica de “today view”.

### Scoring ronda libre

#### Rutas involucradas
- `/ronda-libre/[codigo]`
- `/ronda-libre/[codigo]/score`

#### Objetivo del usuario
Cargar score rápido, con placer de uso y con total sensación de control.

#### Mapa del flujo actual paso a paso
1. El usuario entra por código/link.
2. Elige rol o identidad.
3. Llega al score.
4. Ve jugador activo, hoyo actual y score actual.
5. Usa +/-, chips o mini-grid.
6. Avanza de hoyo en hoyo.
7. Finaliza ronda.
8. Ve transición hacia tAIger o scorecard.

#### Fricciones exactas por paso

##### Paso 1: entrada
- Muy bien resuelta.
- Poca fricción.

##### Paso 2: score principal
- Fricción residual: algunos elementos secundarios aún compiten.
- Qué la provoca: QR, información extendida, mini-grid y extras conviven.
- Impacto: no bloquea, pero resta pureza.

##### Paso 3: guardado
- Fricción residual: el guardado es correcto, pero puede ser más tranquilizador.
- Impacto: pequeña mejora pendiente.

##### Paso 4: finalización
- Bastante buena.
- El banner de tAIger interrumpe con intención, pero puede volverse más elegante aún.

#### Errores probables
- Pocos.
- Principalmente duda residual sobre guardado o exceso de elementos secundarios.

#### Estados y edge cases

##### Estado normal
- Muy fuerte.

##### Loading
- Adecuado.

##### Empty
- Resuelto por contexto previo.

##### Error
- Offline y error de guardado están contemplados.
- Buen nivel comparativo dentro del producto.

##### Guardado
- Bueno, aún mejorable.

##### Edición / corrección
- Clara y rápida.

##### Reingreso
- Bastante bueno, con continuidad razonable.

##### Edge cases importantes
- Offline.
- Cambio de jugador.
- Swipe accidental.
- Finalización con análisis posterior.

#### Evaluación en contexto real
- Una mano: muy buena.
- Caminando: muy buena.
- Atención parcial: muy buena.
- Bajo sol: buena.
- Con apuro: muy buena.
- Uso recurrente: muy buena.

#### Cómo debería ser el flujo ideal
- Mantener lo ya correcto.
- Hacerlo aún más puro:
  - score domina
  - guardado tranquiliza
  - contexto secundario no distrae

Qué domina visualmente:
- hoyo actual
- score actual
- CTA siguiente

Qué queda secundario:
- QR
- metadata
- módulos de análisis o share

Qué se fija sticky:
- CTA principal
- estado operativo mínimo

#### Quick wins
- Hacer más fuerte la confirmación de guardado.
- Reducir ruido de módulos secundarios.
- Mejorar legibilidad de textos auxiliares.

#### Rediseños medianos
- Modo “ultra focus”.
- Mayor separación entre captura y contexto.

#### Rediseños estructurales
- No requiere reestructuración total; requiere refinamiento premium.

### Historial

#### Rutas involucradas
- `/perfil/historial`

#### Objetivo del usuario
Registrar rondas históricas sin agotarse y revisar rápidamente su progreso.

#### Mapa del flujo actual paso a paso
1. Entrar al historial.
2. Interpretar header y progreso tAIger.
3. Abrir formulario.
4. Cargar cancha, tees, fecha y 18 scores.
5. Guardar.
6. Revisar tarjetas existentes.

#### Fricciones exactas por paso

##### Paso 1: entrada
- Fricción: header potente, pero denso.
- Impacto: bastante información antes de actuar.

##### Paso 2: formulario
- Fricción: alto volumen de inputs y decisión repetitiva.
- Error o duda: fácil cansarse o equivocarse.
- Impacto: abandono probable.

##### Paso 3: score inputs
- Fricción: 18 campos seguidos.
- Impacto: experiencia poco amable para móvil.

##### Paso 4: revisión
- Fricción: cards correctas, pero conviven con la carga pesada del flujo.
- Impacto: mezcla de modos mentales.

#### Errores probables
- Score en hoyo incorrecto.
- Abandono antes de terminar.
- Error no detectado por saturación.

#### Estados y edge cases

##### Estado normal
- Funcional, denso.

##### Loading
- Hay fallback.

##### Empty
- Correcto y motivacional.

##### Error
- Existe recuperación.

##### Éxito
- Menos ceremonial de lo ideal.

##### Reingreso
- Correcto, pero no necesariamente más simple.

##### Edge cases importantes
- Usuario con poco tiempo.
- Ronda incompleta.
- Necesidad de revisar y no cargar.

#### Evaluación en contexto real
- Una mano: regular.
- Caminando: mala.
- Atención parcial: mala.
- Bajo sol: regular.
- Con apuro: mala.
- Uso recurrente: cansador.

#### Cómo debería ser el flujo ideal
- Summary first, carga después.
- Menos campos simultáneos.
- Captura en bloques o pasos.
- El progreso debe sentirse liviano, no exigente.

Qué domina visualmente:
- CTA de agregar ronda
- progreso actual
- resumen de impacto

Qué queda secundario:
- detalles extendidos
- notas largas
- scorecards completas

#### Quick wins
- Aligerar header.
- Mejorar jerarquía del formulario.
- Dar más foco al preview.

#### Rediseños medianos
- Separar consulta y carga.
- Dividir front/back o bloques de hoyos.

#### Rediseños estructurales
- Rehacer captura histórica como wizard móvil.

## 4. Benchmark interno

El scoring de ronda libre es hoy el mejor benchmark interno del producto porque resuelve correctamente varios principios que faltan en otros flujos:

- foco único muy claro
- controles grandes y cómodos
- contexto mínimo suficiente
- CTA sticky
- progreso visible
- continuidad entre pasos
- feedback de guardado
- compatibilidad real con una mano
- buena tolerancia a atención parcial

Principios que deben heredarse a scoring torneo:
- un solo foco operacional a la vez
- targets grandes
- navegación secuencial
- contexto fijo
- guardado visible
- jerarquía extrema entre primario y secundario

Principios que también deberían heredarse a leaderboard y dashboard:
- resumen fuerte primero
- detalle después
- menos ruido en el fold inicial
- más continuidad y menos exploración

## 5. Top 15 cambios con mayor impacto real

1. Rehacer scoring torneo como flujo secuencial por hoyo.
2. Separar scoring torneo de stats opcionales.
3. Rediseñar leaderboard móvil como ranking card-first.
4. Crear arquitectura de navegación móvil estable.
5. Reordenar dashboard según siguiente mejor acción.
6. Hacer visible el guardado por hoyo en scoring.
7. Dar contexto fijo de jugador activo en scoring torneo.
8. Reducir densidad del primer viewport del dashboard.
9. Simplificar spectator view de ronda libre.
10. Reestructurar historial como captura progresiva.
11. Mejorar legibilidad outdoor en pantallas críticas.
12. Unificar headers, backs y CTAs.
13. Refinar scoring de ronda libre con modo ultra focus.
14. Bajar densidad conceptual del coach.
15. Crear un lenguaje premium de confirmación, error y éxito.

## 6. Backlog listo para Claude

### Sprint 1

#### 1. Reestructura operativa de scoring torneo
- Flujo afectado: scoring torneo
- Problema exacto: captura densa y riesgosa.
- Cambio propuesto: flujo centrado en hoyo y jugador activo.
- Impacto esperado: máximo.
- Complejidad relativa: alta

#### 2. Refactor de leaderboard mobile a ranking escaneable
- Flujo afectado: leaderboard
- Problema exacto: table-first y fatiga visual.
- Cambio propuesto: cards, sticky context y detalle progresivo.
- Impacto esperado: muy alto.
- Complejidad relativa: alta

#### 3. Normalización de navegación mobile
- Flujo afectado: transversal
- Problema exacto: arquitectura inconsistente.
- Cambio propuesto: patrón común de navegación, headers y back behavior.
- Impacto esperado: muy alto.
- Complejidad relativa: media-alta

### Sprint 2

#### 4. Dashboard contextual
- Flujo afectado: dashboard
- Problema exacto: demasiadas opciones al mismo nivel.
- Cambio propuesto: priorizar acciones activas y recurrentes.
- Impacto esperado: alto.
- Complejidad relativa: media

#### 5. Refinamiento premium de scoring ronda libre
- Flujo afectado: ronda libre score
- Problema exacto: aún hay ruido residual.
- Cambio propuesto: modo ultra focus y guardado más visible.
- Impacto esperado: alto.
- Complejidad relativa: media

#### 6. Simplificación de spectator view
- Flujo afectado: ronda libre spectator
- Problema exacto: demasiadas capas en la primera lectura.
- Cambio propuesto: resumen más fuerte y capas progresivas.
- Impacto esperado: alto.
- Complejidad relativa: media

#### 7. Historial por pasos
- Flujo afectado: historial
- Problema exacto: formulario cansador.
- Cambio propuesto: dividir captura y consulta, reducir simultaneidad.
- Impacto esperado: alto.
- Complejidad relativa: media-alta

### Sprint 3

#### 8. Sistema transversal de estados
- Flujo afectado: scoring, dashboard, coach, historial
- Problema exacto: feedback funcional pero irregular.
- Cambio propuesto: normalizar loading, success, error y saved states.
- Impacto esperado: medio-alto.
- Complejidad relativa: media

#### 9. Ajustes de legibilidad outdoor
- Flujo afectado: transversal
- Problema exacto: secundarios pequeños y contraste mejorable.
- Cambio propuesto: recalibrar tipografías y contraste en pantallas críticas.
- Impacto esperado: medio-alto.
- Complejidad relativa: media

#### 10. Coach con menos densidad y más guidance
- Flujo afectado: coach
- Problema exacto: valor menos inmediato de lo ideal.
- Cambio propuesto: jerarquía más clara, menos texto, mejor manejo de límites.
- Impacto esperado: medio.
- Complejidad relativa: media

## 7. Prompt final para Claude

```md
Quiero que uses `docs/CRITICAL_MOBILE_FLOW_SPECS_2026-03-17.md` como especificación operativa principal de UX mobile.

No hagas una interpretación vaga del informe.
No te quedes en cambios visuales.
No hagas cosmética.

## Objetivo

Implementar mejoras reales de UX mobile en los flujos críticos del producto, priorizando:
1. scoring torneo
2. leaderboard mobile
3. navegación transversal
4. dashboard
5. refinamiento premium de scoring ronda libre
6. historial

## Regla principal

Cada cambio debe resolver un problema operativo concreto del flujo:
- reducir error
- reducir carga cognitiva
- acelerar tarea
- mejorar uso con una mano
- aumentar confianza

## Cómo trabajar

### Fase 1
- Revisa el documento completo
- Identifica exactamente los pasos y estados de cada flujo
- No inventes rediseños genéricos

### Fase 2
- Implementa primero scoring torneo
- Debe dejar de sentirse como grilla o consola densa
- Debe heredar principios del scoring de ronda libre

### Fase 3
- Implementa leaderboard mobile con mejor scanability
- Prioriza ranking, diferencia, hoyo y detalle progresivo

### Fase 4
- Normaliza navegación móvil, headers y back behavior

### Fase 5
- Reestructura dashboard y luego historial

### Fase 6
- Refina scoring de ronda libre sin romper lo que ya funciona bien

## Criterios de calidad

- Mobile-first real
- Una mano
- Atención parcial
- Uso recurrente
- Baja tolerancia a error
- Lo principal debe entenderse de inmediato
- Lo secundario debe quedar progresivamente oculto
- Las confirmaciones deben ser visibles y tranquilizadoras

## Qué evitar

- No hagas refactors amplios sin impacto claro
- No conviertas todo en tablas o layouts genéricos
- No metas más información arriba del fold
- No rompas el flujo fuerte de ronda libre
- No respondas solo con cambios de spacing, color o tipografía si no resuelven el problema operativo

## Entrega esperada

Al final quiero:
- resumen de cambios por flujo
- explicación de cómo mejoró cada flujo crítico
- validaciones ejecutadas
- riesgos pendientes
```
