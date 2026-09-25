# ADR-084: Lectura local con jsQR

Estado: propuesto en issue #85; pendiente de integración.

## Contexto

BarcodeDetector no ofrece soporte uniforme y la alternativa manual debe permanecer.

## Decisión

Reutilizar jsQR 1.4.0 como dependencia de producto para leer frames locales. Solicitar vídeo tras acción explícita y conservar licencia Apache-2.0.

## Consecuencias

Añade peso al módulo diferido del operador, sin subir imágenes ni depender de servicios externos. No cambia la versión resuelta.
