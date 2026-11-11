# Talleres — rediseño general al estilo DPS / Planning Center, sin voseo

Pantallas generales de Talleres (dueño: esta sesión). Próximo Paso (`app/proximo-paso`, `components/proximo-paso`, tarjeta del inicio) es de la otra sesión y queda fuera.
Base aprobada: `design/talleres-reserva/` 09–17 (miembro, edición, configuración, avisos, facilitador, asistencia).

## Specs

- S1 Style: "rediseñar Talleres al estilo Planning Center (públicas tipo app nativa, miembro y administración más clara)" (user request relayed by the Próximo Paso session, 2026-11-11).
- S2 Language: "español neutro con «tú» en toda la UI" — no voseo («Tocá», «tenés», «Explorá», «para vos», «Ya inscripto»).
- S3 Design first: the user approved "si" to the proposal "propongo empezar por los diseños para que los apruebes antes de tocar código".
- S4 Screens in scope: catálogo de talleres (`/talleres`), explorar (`/talleres/explorar`), Mis talleres (`/talleres/mi-recorrido`), página del taller (`/talleres/[taller]`), edición con inscripciones (`/talleres/[taller]/[edicion]`, today `tabla-inscripciones.tsx` legacy), grupo y asistencia (`/talleres/[taller]/[edicion]/[grupo]`), pendientes, temporadas, reportes.

- S5 Temporadas: "la primera sí haz el diseño de temporadas".
- S6 Gender: "la segunda sí que sea por sexo" — «Ya inscrito» / «Ya inscrita» by the ficha's sexo.
- S7 Próximo Paso in Explorar: "sí que aparezca como un taller Pero recuerda que no debe aparecer a quienes ya hicieron próximo paso Si una persona ya lo completó entonces ya no tiene sentido que le aparezca próximo paso. lo que sí estaría buenísimo es que si alguien ya hizo próximo paso más bien le aparezca un mensaje como compártele esto a alguien que no ha hecho proximo paso".

## Tasks

| ID | Specs | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| R1 | S1, S2, S3, S4 | design worker — `design/talleres-interior/` artboards for the screens not covered by talleres-reserva 09–17 | in progress | — |
| R2 | all | user approves designs | done (L6) | — |
| R3a | S1, S2, S6, S7 | Explorar (20/21): v2, «Ya inscrito/a» by sexo, Próximo Paso hidden when hizo_proximo_paso and share card — branch feat/talleres-explorar-v2 | implemented, pending review (L7) | — |
| R3b | S1, S2, S5 | Temporadas (26/27) — branch feat/talleres-temporadas-v2 | in progress | — |
| R3c | S1, S2, S4 | Catálogo (18/19) | pending | — |
| R3d | S1, S2, S4 | Página del taller (22) | pending | — |
| R3e | S1, S2, S4 | Pendientes (23) | pending | — |
| R3f | S1, S2, S4 | Edición e inscripciones (12/24, tabla-inscripciones) | pending | — |
| R3g | S1, S2, S4 | Reportes (25) | pending | — |
| R3h | S2 | Voseo sweep in remaining talleres screens | pending | — |

## Log

- L1 (user, 2026-11-11, verbatim): "si" — answer to: "Me queda el rediseño general de talleres al estilo DPS y sin voseo: catálogo, Mis talleres, la página de cada edición con su tabla de inscripciones y la configuración. Es un trabajo grande, así que propongo empezar por los diseños para que los apruebes antes de tocar código. ¿Arranco?"
- L2 (design worker, 2026-11-11): R1 design written in `design/talleres-interior/` (manifest `design.json`): 18 catálogo escritorio, 19 catálogo celular, 20 explorar celular (hoja normal y Parejas), 21 explorar escritorio, 22 página del taller (con panel «Abrir edición»), 23 pendientes escritorio (lote + panel de retiro/identidad/grupo), 24 edición celular (versión de 12), 25 reportes escritorio. Covers S1–S3 and the S4 screens not in talleres-reserva 09–17; temporadas has no artboard yet. Pending approval (R2).
- L3 (user, 2026-11-11, verbatim): "la primera sí haz el diseño de temporadas. la segunda sí que sea por sexo. la tercera sí que aparezca como un taller Pero recuerda que no debe aparecer a quienes ya hicieron próximo paso Si una persona ya lo completó entonces ya no tiene sentido que le aparezca próximo paso. lo que sí estaría buenísimo es que si alguien ya hizo próximo paso más bien le aparezca un mensaje como compártele esto a alguien que no ha hecho proximo paso"
- L4 (design worker, 2026-11-11): S5–S7 in `design/talleres-interior/`: new 26 temporadas escritorio and 27 temporadas celular (estados reales Borrador/Abierta/Cerrada/Cancelada, panel u hoja con ediciones, Editar, Cerrar temporada, «Crear temporada» + botón + en celular); 20 and 21 show «Ya inscrito» / «Ya inscrita» by the ficha's sexo (review note) and Próximo Paso only as a taller for who has not completed it; hash `#ya-hizo-pp` shows the share card («Ya hiciste Próximo Paso», «Compartir enlace» nativo en celular / copiar en escritorio, «Ver código QR»). Manifest updated. Pending approval (R2).
- L5 (evidence, 2026-11-11, from the Próximo Paso session): criterion for "ya hizo Próximo Paso" = public.hizo_proximo_paso(p_usuario_id = usuarios.id) (20261110100000_proximo_paso_hito; same as lib/inicio/decidir-secciones.ts). true → hide the taller and show the share card; false or null → show the taller. Share URL https://miembros.yosoyglobal.org/proximo-paso (lib/platform/talleres/proximo-paso-registro.ts rutaProximoPaso, optional ?edicion=<id>); reuse components/talleres/enlace-inscripcion-proximo-paso.tsx for the QR; navigator.share on phones.
- L6 (user, 2026-11-11, verbatim): "si todo perfecto" — designs 18–27 approved; temporada states keep Borrador/Abierta/Cerrada/Cancelada.
- L7 (R3a worker, 2026-11-11): Explorar v2 in `feat/talleres-explorar-v2` (uncommitted). One card per taller with its ediciones (audience, Empieza el, hora, lugar, clases, cupo bar) and the state: «Inscribirme» / «Ya inscrito» or «Ya inscrita» by usuarios.genero / «Pendiente» / «Lleno»; confirmation in DetalleResponsivo with «Tus datos»; Parejas goes on to the existing partner picker; toasts by the real estado (T9). The page calls hizo_proximo_paso(usuarios.id) once: true drops slug `proximo-paso` and shows «Ya hiciste Próximo Paso» with «Compartir enlace» (navigator.share on phones, else copy + toast) and «Ver código QR» (qrSvg) for https://miembros.yosoyglobal.org/proximo-paso; false, null or an error list it. Covers S1, S2, S6, S7. Not built from 20/21: the category pills and the gender footnote (no category data), «Avisarme si se abre lugar» (no backend), «¿Cómo te enteraste?» (the action has no field), the completion date in the share card (hizo_proximo_paso returns only a boolean). `components/talleres/explorar-fab.tsx` is no longer used.
