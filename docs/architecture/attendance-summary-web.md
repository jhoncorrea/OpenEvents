# Métricas de asistencia en la web

Issue #91 - OE-05-001B. Usa el contrato de [attendance-summary.md](attendance-summary.md), sin cambios del servidor.

## Recorrido

Organizador: Mis eventos > Ver detalle. Operador: Eventos asignados > Seleccionar. El resumen identifica su contexto mediante el detalle del evento y consulta automáticamente al montarse. Actualizar métricas hace otra lectura explícita. Volver y abrir de nuevo consulta nuevamente; no existe sondeo.

Registrados muestra registered e indica confirmed/cancelled. Ingresaron muestra checkedIn y cancelledCheckedIn como historial conservado. Pendientes usa pending directamente y explica que son confirmadas sin ingreso. No se calculan porcentajes. observedAt se presenta con segundos, formato de 24 horas y zona del evento.

Después de un ingreso aceptado o duplicado, la vista mantiene la última consulta con su fecha y la indicación de actualizar. No se incrementan contadores localmente. El botón de actualización evita lecturas simultáneas; mientras carga se retiran las cifras anteriores. Fallos no equivalen a cero y permiten reintento explícito cuando no se ha perdido acceso.

## Aislamiento y errores

El cliente adquiere token con cuenta y scope actuales. Antes y después de esperar token, HTTP y JSON comprueba cancelación/contexto. El transporte exige HTTPS salvo localhost, no admite credenciales ni query en la URL base, omite cookies y rechaza redirecciones. Tiene timeout de 15 segundos para HTTP/lectura; no reintenta automáticamente.

Valida UUID del evento, todos los contadores enteros seguros no negativos, invariantes y observedAt UTC canónico. Rechaza datos incompletos o de otro evento. Proyecta solo campos conocidos. No utiliza storage ni logs de credenciales.

Salir del detalle, cambiar evento/cuenta o desmontar por interacción de sesión cancela la lectura; se descartan resultados tardíos. 401/403 o fallo de autenticación/interacción invalidan acceso. 404 retira el detalle consultado. Los demás fallos se muestran como error de métricas, sin conservar valores anteriores.

## Demo y alcance

Se eliminan las tarjetas globales 240/168/72 y sus porcentajes. Cabecera, estado lateral y actividad de ejemplo se identifican como demostración. No se conectan últimos ingresos ni el check-in de ejemplo; el check-in persistido continúa dentro del evento del operador. No es un rediseño global ni un tablero en tiempo real.

## Validación

1.216 pruebas web aprobadas, 64 nuevas; typecheck, lint y build web aprobados en copia aislada. Incluye contrato, errores, timeout, cancelación, cambio de cuenta/sesión, estados del evento, refresco explícito tras ingreso/duplicado y ausencia de tarjetas fijas. Validación del mantenedor del 26 de septiembre de 2026: copia de 21 archivos verificada con SHA-256 y git diff --check sin errores. Typecheck y lint aprobados. La primera ejecución de pruebas falló en una espera de carga inicial del componente real de Mis eventos dentro de la prueba CSV; se precargan los módulos reales en beforeAll sin quitar aserciones ni modificar producción. Tras copiar esa corrección, pnpm test aprobó 2.226 pruebas (1.216 web y 1.010 API) y build aprobó ambas aplicaciones. No se atribuye una nueva ejecución de PostgreSQL.

Evidencia manual: organizador y operador asignado muestran 4 registrados, 4 ingresos y 0 pendientes en API 035, con fecha de consulta America/Lima. Una nueva inscripción produce 5/4/1 en ambas vistas. Tras aceptar el ingreso a las 17:10, el operador conserva 5/4/1 hasta actualizar; luego muestra 5/5/0 a las 17:10:51. El organizador confirma 5/5/0 a las 17:11:23 y el detalle de inscripción muestra Ya ingresó. El segundo envío avisa que ya existe ingreso y no creó otro; la consulta posterior conserva 5/5/0 a las 17:13:12. La captura estrecha del operador muestra las tres tarjetas apiladas, con números, desgloses y fecha legibles sin recortes visibles. No se atribuye prueba manual de cancelación, revocación, cambio de cuenta ni fallo de red; conservan cobertura automatizada. No se incorporan capturas con credenciales ni códigos a la documentación. Pendientes commit, PR, CI y merge. API/PostgreSQL sin cambios y sin repetir suites en esta validación del agente.
