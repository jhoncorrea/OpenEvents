# ADR-062: Representación local del QR

Estado: propuesto en issue #69; pendiente de integración.

## Contexto

El organizador recibe un secreto opaco y necesita una representación legible por escáner sin transmitirlo a otro servicio.

## Decisión

Usar qrcode 1.5.4 para codificar exclusivamente los bytes del token, con corrección M. Dibujar SVG mediante React: negro sobre blanco, margen de cuatro módulos y tamaño adaptable. Fijar versiones y verificar la geometría con jsQR como lector independiente en pruebas.

## Consecuencias

Se añade una dependencia de producto y dependencias de desarrollo. La API continúa entregando JSON, no imágenes. Sin cámara, correo ni descarga dedicada. El SVG contiene una representación del secreto y debe recibir la misma protección.
