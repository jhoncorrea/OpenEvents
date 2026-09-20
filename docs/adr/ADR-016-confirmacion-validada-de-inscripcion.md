# ADR-016 — Confirmación validada de inscripción

Seguimiento: OE-03-001B, Issue #37.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

Una interfaz podría anunciar éxito ante respuestas inesperadas, datos de otro evento o un conflicto por correo. La información del listado puede quedar obsoleta antes de abrir el formulario.

## Decisión

Consultar de nuevo el evento antes de abrir, habilitar draft/active y enviar solo fullName/email normalizados. Confirmar únicamente una respuesta 201 validada que corresponda al evento y valores enviados. Mostrar duplicado como error corregible sin recuperar el perfil existente; comenzar otra inscripción solo por acción explícita.

## Consecuencias

La confirmación queda vinculada a la solicitud y se limita la exposición de datos. Hay una lectura adicional y las respuestas incompatibles se tratan conservadoramente como inciertas. La consulta previa no reserva permisos ni estado; el POST debe revalidarlos. No se verifica propiedad del correo ni se añade listado, QR o notificaciones.
