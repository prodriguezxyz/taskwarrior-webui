# Panel Kanban Para Tareas

## Summary

Anadir una vista kanban como modo alternativo de la lista actual. El tablero respetara el contexto activo: Inbox, Today, Mine, proyecto, tag y filtros de chips. Las columnas usaran un campo Taskwarrior/UDAs llamado `kanban`, persistido junto con la tarea mediante el endpoint actual de actualizacion.

La primera version sera frontend-first: sin nuevos endpoints backend, con drag/drop en escritorio y acciones por menu/botones para movil y accesibilidad.

## Key Changes

- Anadir un selector de modo `Table / Kanban` en la toolbar de `TaskList`, guardado por usuario en `localStorage`.
- Crear un componente `KanbanBoard` que reciba las tareas ya filtradas por el contexto actual y las agrupe por `task.kanban`.
- Definir columnas iniciales fijas: `Backlog`, `Ready`, `In Progress`, `Blocked`, `Review`.
- Tratar tareas sin `kanban` como `Backlog`, sin escribir ese valor hasta que el usuario las mueva.
- Mover una tarjeta entre columnas actualizara solo `{ ...task, kanban: columnKey }` usando `store.dispatch('updateTasks', ...)`.
- Mantener el estado Taskwarrior separado: `completed`, `deleted` y `recurring` siguen siendo estados reales, no columnas kanban.
- En kanban mostrar tareas activas del contexto actual: principalmente `pending`; las tareas `waiting` podran aparecer si pasan los filtros del contexto, con senal visual de espera.
- Cada tarjeta mostrara descripcion, proyecto si aplica, prioridad, vencimiento, assignee, tags visibles y chip de perfil en vistas cross-profile.
- Las acciones existentes se preservan desde la tarjeta: editar, completar/restaurar cuando aplique, reprogramar, borrar y menu contextual si encaja.

## Implementation Details

- Reutilizar la logica actual de filtrado/clasificacion de `TaskList` para no duplicar reglas de Inbox, Today, Mine, perfiles, tags, assignee y prioridad.
- Extraer helpers compartidos de presentacion cuando sea necesario: `displayDate`, `dueMetaClass`, `visibleTags`, `assigneeLabel` y apertura del dialogo de edicion.
- Usar drag/drop nativo HTML5 para evitar una nueva dependencia en Nuxt 2/Vue 2.
- Anadir controles por tarjeta para mover a columna anterior/siguiente, usados en movil y como alternativa accesible.
- Guardar la preferencia de modo por usuario, similar a `settings:<email>` y `hiddenColumns:<email>`.
- No anadir configuracion de columnas en v1; las columnas fijas reducen riesgo y dejan una base clara para una futura pantalla de configuracion.

## Test Plan

- Ejecutar `cd frontend && npm run build`.
- Ejecutar `cd backend && npm run build`.
- Verificar manualmente:
  - Alternar Table/Kanban en Inbox, Today, Mine, proyecto y tag.
  - Mover una tarjeta con drag/drop y confirmar que persiste tras refresh.
  - Mover con botones/menu en viewport movil.
  - Confirmar que completed/deleted no se mezclan como columnas kanban.
  - Confirmar que multi-profile mantiene `_profile` fuera del payload persistido.
  - Confirmar que filtros por tag, assignee y prioridad afectan al tablero igual que a la tabla.

## Assumptions

- El campo UDA se llamara `kanban`.
- Las columnas iniciales seran fijas: `backlog`, `ready`, `doing`, `blocked`, `review`.
- La vista kanban opera sobre el contexto actual, no como seccion lateral independiente.
- Completar una tarea seguira siendo una accion explicita, separada de moverla a `Review`.
