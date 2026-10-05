# Interfaz aprobada de Fair Turns

## Cambios
- Reorganizar la vista de clase en escritorio como “Lista destacada”: participantes presentes en dos columnas a la izquierda y alumno actual, temporizador, modos y acciones a la derecha; en móvil se apila sin desbordar.
- Unificar la ventana flotante y Compact mode con pestañas permanentes `Controls` y `Tally marks`, encabezado fijo, contenido desplazable y NEXT/pausa siempre accesibles.
- Mostrar filas compactas reutilizando los tally marks existentes, AF ✓, alumno actual y el botón independiente de asistencia; los nombres siguen seleccionando manualmente.
- Separar los ausentes en `Absent (n)`, plegado inicialmente y con orden estable, tanto en web como en la vista flotante/compacta.
- Añadir Theme: `System` (predeterminado), `Light` y `Dark`; guardar la elección y sincronizarla en la web, Picture-in-Picture y Compact mode sin alterar los seis colores de acento.
- Conservar navegación, edición, Float, clases guardadas, temporizadores Normal/AF, Skip/Undo y toda la lógica de selección y persistencia.

## Detalles técnicos
- La preferencia de tema se guardará en localStorage y `System` seguirá `prefers-color-scheme` en vivo.
- La lista usará los mismos estudiantes, conteos y acciones actuales; solo cambia su composición visual.
- Se añadirá una prueba pequeña para la preferencia de tema y se validará con 20 nombres, nombre largo, ausentes, selección manual, NEXT, recarga, tema claro/oscuro y viewport de 320×320.
