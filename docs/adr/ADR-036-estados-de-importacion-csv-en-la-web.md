# ADR-036: Estados de importación CSV en la web

Estado: propuesto en issue #51; pendiente de integración.

## Contexto

Un timeout o not_observed no demuestra rollback. Un error de un reenvío tampoco deshace la incertidumbre de un intento anterior.

## Decisión

Mantener clave y archivo tras incertidumbre, ofrecer consulta y reenvío explícitos. Liberar un primer intento rechazado de forma definitiva o iniciar otro tras completed y acción explícita.

## Consecuencias

No hay reintentos automáticos ni cambio de clave para resolver incertidumbre. La recuperación en eventos cerrados utiliza la misma operación; no habilita nuevas importaciones.
