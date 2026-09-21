import { registerAttendeeInputSchema, type RegisterAttendeeInput } from "./register-attendee-input.js";

export const REGISTRATION_CSV_LIMITS = Object.freeze({ bytes: 1_048_576, records: 500, errors: 100 });
export type RegistrationCsvErrorCode = "FILE_TOO_LARGE" | "INVALID_UTF8" | "EMPTY_FILE" |
  "INVALID_HEADER" | "NO_RECORDS" | "TOO_MANY_RECORDS" | "MALFORMED_CSV" |
  "EMPTY_RECORD" | "INVALID_COLUMNS" | "INVALID_NAME" | "INVALID_EMAIL" | "DUPLICATE_EMAIL";
export interface RegistrationCsvError {
  code: RegistrationCsvErrorCode;
  message: string;
  /** Registro de datos, desde 1, sin contar el encabezado. */
  record?: number;
  /** Línea física inicial, desde 1, contando también el encabezado. */
  line?: number;
  field?: "fullName" | "email";
  firstRecord?: number;
}
export type RegistrationCsvResult =
  | { valid: true; rows: RegisterAttendeeInput[]; count: number }
  | { valid: false; errors: RegistrationCsvError[]; truncated: boolean };

const messages: Record<RegistrationCsvErrorCode, string> = {
  FILE_TOO_LARGE: "El archivo supera el límite de tamaño.",
  INVALID_UTF8: "El archivo debe estar codificado en UTF-8 válido.",
  EMPTY_FILE: "El archivo está vacío.",
  INVALID_HEADER: "El encabezado debe contener fullName,email en ese orden.",
  NO_RECORDS: "El archivo no contiene registros de datos.",
  TOO_MANY_RECORDS: "El archivo supera el límite de registros.",
  MALFORMED_CSV: "El formato CSV no es válido.",
  EMPTY_RECORD: "El registro está vacío.",
  INVALID_COLUMNS: "El registro debe contener exactamente dos columnas.",
  INVALID_NAME: "El nombre no cumple las reglas de inscripción.",
  INVALID_EMAIL: "El correo no cumple las reglas de inscripción.",
  DUPLICATE_EMAIL: "El correo está repetido dentro del archivo.",
};

/** Validador puro: no importa filas, no consulta permisos ni duplicados persistidos. */
export function validateRegistrationCsv(bytes: Uint8Array): RegistrationCsvResult {
  const errors: RegistrationCsvError[] = [];
  let truncated = false;
  function report(code: RegistrationCsvErrorCode, location: Omit<RegistrationCsvError, "code" | "message"> = {}) {
    if (errors.length < REGISTRATION_CSV_LIMITS.errors) errors.push({ code, message: messages[code], ...location });
    else truncated = true;
  }
  const invalid = (): RegistrationCsvResult => ({ valid: false, errors, truncated });
  if (bytes.byteLength > REGISTRATION_CSV_LIMITS.bytes) { report("FILE_TOO_LARGE"); return invalid(); }
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { report("INVALID_UTF8"); return invalid(); }
  if (!text.length) { report("EMPTY_FILE"); return invalid(); }

  const rows: RegisterAttendeeInput[] = [];
  const firstEmails = new Map<string, number>();
  let header = false;
  let count = 0;
  let line = 1;
  let startLine = 1;
  let recordStart = 0;
  let fields: string[] = [];
  let field = "";
  let state: "start" | "bare" | "quoted" | "closed" = "start";
  const location = () => header ? { record: count + 1, line: startLine } : { line: startLine };
  function finishRecord(): boolean {
    fields.push(field);
    if (!header) {
      if (fields.length !== 2 || fields[0] !== "fullName" || fields[1] !== "email") {
        report("INVALID_HEADER", { line: startLine }); return false;
      }
      header = true;
    } else {
      count++;
      const at = { record: count, line: startLine };
      if (count > REGISTRATION_CSV_LIMITS.records) { report("TOO_MANY_RECORDS", at); return false; }
      if (fields.length === 1 && fields[0] === "") report("EMPTY_RECORD", at);
      else if (fields.length !== 2) report("INVALID_COLUMNS", at);
      else {
        // Validar cada campo permite detectar duplicados incluso si su nombre es inválido.
        const name = registerAttendeeInputSchema.shape.fullName.safeParse(fields[0]);
        const email = registerAttendeeInputSchema.shape.email.safeParse(fields[1]);
        if (!name.success) report("INVALID_NAME", { ...at, field: "fullName" });
        if (!email.success) report("INVALID_EMAIL", { ...at, field: "email" });
        let duplicate = false;
        if (email.success) {
          const firstRecord = firstEmails.get(email.data);
          duplicate = firstRecord !== undefined;
          if (duplicate) report("DUPLICATE_EMAIL", { ...at, field: "email", firstRecord });
          else firstEmails.set(email.data, count);
        }
        if (name.success && email.success && !duplicate) rows.push({ fullName: name.data, email: email.data });
      }
    }
    fields = []; field = ""; state = "start";
    return true;
  }

  // Máquina de estados: las comas y saltos dentro de comillas no separan registros.
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] !== "\n") { report("MALFORMED_CSV", location()); return invalid(); }
      const newline = char === "\r" ? "\r\n" : "\n";
      if (state === "quoted") field += newline;
      else if (!finishRecord()) return invalid();
      if (char === "\r") i++;
      line++;
      if (state !== "quoted") { startLine = line; recordStart = i + 1; }
      continue;
    }
    if (state === "quoted") {
      if (char === '"') state = "closed";
      else field += char;
    } else if (state === "closed") {
      if (char === '"') { field += '"'; state = "quoted"; }
      else if (char === ",") { fields.push(field); field = ""; state = "start"; }
      else { report("MALFORMED_CSV", location()); return invalid(); }
    } else if (char === ",") {
      fields.push(field); field = ""; state = "start";
    } else if (char === '"') {
      if (state !== "start") { report("MALFORMED_CSV", location()); return invalid(); }
      state = "quoted";
    } else { field += char; state = "bare"; }
  }
  if (state === "quoted") { report("MALFORMED_CSV", location()); return invalid(); }
  if (recordStart < text.length && !finishRecord()) return invalid();
  if (!count) report("NO_RECORDS");
  return errors.length ? invalid() : { valid: true, rows, count };
}
