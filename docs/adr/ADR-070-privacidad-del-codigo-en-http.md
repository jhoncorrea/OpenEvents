# ADR-070: Privacidad del código en HTTP

Estado: aceptado mediante PR #76, merge 6f87944; CI aprobado.

## Contexto

El cuerpo contiene un secreto y los errores de parser o del servidor podrían reflejarlo.

## Decisión

Limitar a JSON UTF-8 estricto, 1 KiB y code string hasta 256 caracteres. Autenticar antes de parsing, aplicar no-store y registrar solo códigos fijos sin errores originales.

## Consecuencias

No aceptar query ni normalizar el token. Los errores no reflejan el contenido. CORS no sustituye permisos y las pruebas verifican ausencia de secretos en logs/respuestas.
