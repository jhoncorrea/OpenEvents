# ADR-011 — Identidad y unicidad de inscripciones

Seguimiento: OE-03-001A, Issue #35.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

Un mismo correo puede participar en varios eventos; reutilizar un perfil global podría revelar o sobrescribir datos ajenos. La unicidad por attendee_id no detecta dos perfiles nuevos con igual correo.

## Decisión

Crear un perfil independiente por inscripción y exigir UNIQUE(event_id, email_normalized). Normalizar ASCII a minúsculas conservando puntos y +; no verificar propiedad ni tratarlo como identidad global. Migrar datos sin fusiones automáticas.

## Consecuencias

Se evita duplicación concurrente dentro del evento y se aísla el perfil entre eventos. Se duplican perfiles y la política de minúsculas puede colapsar buzones que distinguen mayúsculas. Cancelados reservan el correo. Correcciones y reactivación requieren un flujo explícito.
