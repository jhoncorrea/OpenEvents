# ADR-064: Descarga PNG explícita

Estado: propuesto en issue #71; pendiente de integración.

## Contexto

RF-QR-002 requiere un QR descargable, mientras la vista solo conserva temporalmente el token emitido.

## Decisión

Ofrecer un botón PNG explícito que reutiliza qrcode y el mismo token, con margen 4, escala 8, corrección M y negro sobre blanco. Usar un nombre genérico sin secreto ni datos personales y comprobar el PNG con un decodificador independiente.

## Consecuencias

No se repite la emisión ni se envían datos a un servicio externo. El archivo queda bajo control del usuario; salir no lo elimina. Descargar no registra ni valida un check-in.
