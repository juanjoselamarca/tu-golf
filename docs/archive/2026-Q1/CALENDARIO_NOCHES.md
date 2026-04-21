# Calendario de las primeras 5 noches

## Noche 1 — Historial expandible
Componente: RondaDetalle.tsx
Tarea: al tocar una ronda en /perfil/historial, se expande mostrando
el scorecard completo con colores usando HoleColorBar (ya existe).
Riesgo: bajo — componente nuevo, no toca nada existente.
Duracion estimada: 2-3 horas

## Noche 2 — Sistema de niveles (motor invisible)
Tarea: migracion SQL con funcion recalcular_nivel(), trigger automatico
en historical_rounds, columnas nivel/nivel_expires_at en profiles.
Riesgo: medio — toca BD pero solo agrega cosas nuevas.
Duracion estimada: 3-4 horas

## Noche 3 — Sistema de niveles (lo que se ve)
Prerequisito: Noche 2 mergeada y aprobada por Juanjo.
Tarea: barra de progreso en dashboard, badge de nivel en menu,
aviso cuando el nivel esta proximo a bajar.
Riesgo: bajo — componentes nuevos.
Duracion estimada: 2-3 horas

## Noche 4 — Modo organizador en cancha
Tarea: /organizador/[slug]/live — pantalla nueva para que el organizador
vea todos los grupos jugando en tiempo real el dia del torneo.
Riesgo: bajo — ruta completamente nueva.
Duracion estimada: 3 horas

## Noche 5 — Share card del torneo
Tarea: activar el boton "Compartir" en /torneo/[slug] con imagen Canvas
1080x1920. Extension directa de share-card.ts del Sprint 2.
Riesgo: bajo.
Duracion estimada: 1-2 horas
