import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { validateRegistrationCsv } from "../../../apps/api/dist/modules/registrations/validate-registration-csv.js";

const valid = validateRegistrationCsv(await readFile(new URL("./valid.csv", import.meta.url)));
assert.equal(valid.valid, true);
assert.equal(valid.count, 2);
assert.equal(valid.rows[0].email, "persona+prueba@example.com");
assert.equal(valid.rows[1].fullName, "Ejemplo, Dos");
console.log("Archivo válido: 2 registros normalizados; ninguna escritura.");
const invalid = validateRegistrationCsv(await readFile(new URL("./invalid.csv", import.meta.url)));
assert.equal(invalid.valid, false);
assert.equal("rows" in invalid, false);
assert.equal(invalid.truncated, false);
assert.deepEqual(invalid.errors.map(({ code, record, line, firstRecord }) => ({ code, record, line, firstRecord })), [
  { code: "DUPLICATE_EMAIL", record: 2, line: 3, firstRecord: 1 },
  { code: "INVALID_NAME", record: 3, line: 4, firstRecord: undefined },
  { code: "INVALID_EMAIL", record: 4, line: 5, firstRecord: undefined },
]);
console.table(invalid.errors);
console.log("Archivo inválido: tres errores esperados; sin lote importable ni escrituras.");
