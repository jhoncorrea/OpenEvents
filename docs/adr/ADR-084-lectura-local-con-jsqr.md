# ADR-084: Lectura local con jsQR

Estado: aceptado e integrado mediante PR #86 (issue #85), merge 1c9afd5.

## Contexto

BarcodeDetector no ofrece soporte uniforme y la alternativa manual debe permanecer.

## Decisión

Reutilizar jsQR 1.4.0 como dependencia de producto para leer frames locales. Solicitar vídeo tras acción explícita y conservar licencia Apache-2.0.

## Consecuencias

Añade peso al módulo diferido del operador, sin subir imágenes ni depender de servicios externos. No cambia la versión resuelta.
