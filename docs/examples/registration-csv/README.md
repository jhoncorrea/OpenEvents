# Práctica del validador CSV

Datos sintéticos, sin personas reales. La ejecución solo valida archivos; no inicia el servidor ni consulta PostgreSQL.

Desde la raíz del repositorio:

```powershell
pnpm --filter @openevents/api build
node docs/examples/registration-csv/check.mjs
```

El comprobador usa el módulo compilado y verifica ambos ejemplos. Imprime solo cantidad de filas válidas y diagnósticos sin datos personales. Falla con código de salida distinto de cero si los resultados no coinciden.

- valid.csv: válido, 2 registros; correo normalizado y coma entre comillas preservada.
- invalid.csv: inválido; registro 2/línea 3 DUPLICATE_EMAIL con firstRecord 1; registro 3/línea 4 INVALID_NAME; registro 4/línea 5 INVALID_EMAIL. No hay lote rows en el resultado.

El ejemplo práctico no reemplaza las pruebas de frontera automatizadas. Este validador no verifica duplicados persistidos ni autorización de evento.
