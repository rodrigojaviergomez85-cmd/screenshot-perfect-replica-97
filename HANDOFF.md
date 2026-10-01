# Fair Turns — Handoff para integración en otro proyecto

## Qué es

App de una sola página para clases en vivo por Zoom: elige un estudiante al azar por turno, con la regla de que nadie participa dos veces hasta que todos hayan participado una vez (rondas automáticas). Sin backend, sin login, sin base de datos: todo vive en estado de React en memoria.

## Archivos a copiar

| Archivo | Contenido |
| --- | --- |
| `src/routes/index.tsx` | Toda la app: pantallas setup / clase / resumen, lógica de rondas, temporizador, modo Float (Picture-in-Picture), modo Compact, atajos de teclado, panel de roster editable. |
| `src/components/ZoomImport.tsx` | Importación de nombres desde una captura de la lista de participantes de Zoom (OCR en el navegador con tesseract.js). |
| `src/styles.css` | Sistema de diseño completo (tokens oklch, utilidades `stage-card` / `soft-card`, animaciones `pop-in` / `banner-in`). Si el proyecto destino ya tiene su propio CSS, copiar solo las utilidades y keyframes del final. |
| `src/routes/__root.tsx` | Solo si el destino no tiene shell propio. Lo esencial: los `<link>` de Google Fonts (Plus Jakarta Sans + Outfit) y la metadata. |

## Dependencias npm

- `tesseract.js` — OCR del import de Zoom (carga perezosa, solo se descarga al usarlo).
- `lucide-react` — iconos.
- `@tanstack/react-router`, `@tanstack/react-query`, `react`, `react-dom` — ya presentes en cualquier proyecto Lovable/TanStack Start.
- Componentes shadcn usados: `Button` (`@/components/ui/button`). Si el destino no lo tiene, se puede sustituir por un `<button>` con clases.

## Requisitos del stack destino

- TanStack Start v1 (React 19 + Vite). La ruta se crea con `createFileRoute("/")`; para montarla en otra ruta basta renombrar el archivo (p. ej. `src/routes/fair-turns.tsx`) y ajustar el path en `createFileRoute`.
- Tailwind CSS v4 con tokens semánticos (`--color-primary`, `--color-muted-foreground`, etc.). Las clases usan esos tokens; sin ellos los colores no resuelven.
- Fuentes vía `<link>` en el head de la ruta raíz (no `@import` de URL remota en el CSS).

## Reglas de negocio (no negociables)

1. Nadie participa dos veces en la misma ronda; al completarse, banner "Round X complete 🎉" (1.8 s) y empieza la siguiente ronda con todos disponibles.
2. NEXT es instantáneo: selección y reinicio del temporizador en el mismo frame; sin animación de barajado; guarda de 300 ms contra doble clic (`lastNextAt`); pop cosmético de 120 ms (`animate-pop-in`).
3. Temporizador: 15–300 s (defecto 60), ámbar al ≤25 %, rojo en 0, beep suave con Web Audio API; nunca bloquea NEXT.
4. Float usa Document Picture-in-Picture (solo Chrome/Edge); en otros navegadores se oculta y se ofrece modo Compact. Atajos Space (next) y P (pausa) funcionan también con la mini ventana enfocada.
5. Persistencia local: preferencias y varias clases (nombre, alumnos, tallies, ronda, fecha) en localStorage; pantalla inicial "My classes"; al abrir una clase otro día se reinician tallies y rondas conservando alumnos; sin historial; borrar clase requiere confirmación.

## Estado de verificación

- Build OK.
- Carga verificada con Playwright (sin errores de consola).
- No probado con captura real de Zoom ni con la ventana flotante real (PiP requiere Chrome/Edge con gesto de usuario).

## Notas de integración

- El componente `FairTurns` es autocontenido; no recibe props ni contexto externo.
- Si el destino ya tiene fuentes propias, eliminar la clase `font-[family-name:var(--font-display)]` o mapear `--font-display` a la fuente del destino.
- El OCR filtra texto de UI de Zoom ("Participants", "Mute all", etc.) y marca como coach a "(me)/(host)/co-host" para destildarlos por defecto.
