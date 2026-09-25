# ADR-085: Confirmación explícita del QR

Estado: aceptado e integrado mediante PR #86 (issue #85), merge 1c9afd5.

## Contexto

Una cámara puede detectar el mismo código durante muchos frames.

## Decisión

Detenerse tras una lectura y preparar el código, exigiendo Registrar ingreso. Mantener source qr salvo edición manual; validar accepted contra el origen enviado.

## Consecuencias

No hay envío por frame ni reintento automático. Duplicados y resultados inciertos conservan el contrato previo; source no prueba uso real de cámara.
