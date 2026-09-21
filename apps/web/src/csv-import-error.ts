export type CsvErrorKind = "validation" | "configuration" | "authentication" | "interaction_required" | "unauthorized" | "forbidden" | "not_found" | "duplicate" | "not_allowed" | "key_conflict" | "uncertain" | "cancelled";
export interface CsvDiagnostic { code: string; record?: number; line?: number; field?: "fullName" | "email"; firstRecord?: number }
const messages: Record<CsvErrorKind, string> = {
  validation: "Revisa el archivo y los datos de la solicitud.", configuration: "No se pudo configurar la conexión con la API.",
  authentication: "Vuelve a comprobar el acceso con tu cuenta.", interaction_required: "Completa la autorización con Microsoft y vuelve a comprobar el acceso.",
  unauthorized: "Vuelve a comprobar el acceso con tu cuenta.", forbidden: "No tienes permiso para esta operación.",
  not_found: "El evento no está disponible para tu cuenta.", duplicate: "El evento ya tiene una inscripción para uno de los correos.",
  not_allowed: "El evento no admite nuevas inscripciones.", key_conflict: "La clave ya se utilizó con otro contenido. Consulta el comprobante; no cambies la clave.",
  uncertain: "No pudimos confirmar el resultado. Conserva el archivo y consulta el comprobante antes de continuar.",
  cancelled: "La operación se interrumpió; comprueba su resultado antes de volver a importar.",
};
export class CsvImportError extends Error {
  constructor(readonly kind: CsvErrorKind, readonly diagnostics: CsvDiagnostic[] = [], readonly truncated = false) {
    super(messages[kind]); this.name = "CsvImportError";
  }
}
export const csvDiagnosticLabels: Record<string, string> = {
  FILE_TOO_LARGE: "Archivo demasiado grande", INVALID_UTF8: "Codificación UTF-8 inválida", EMPTY_FILE: "Archivo vacío",
  INVALID_HEADER: "Encabezado inválido", NO_RECORDS: "Sin registros", TOO_MANY_RECORDS: "Demasiados registros",
  MALFORMED_CSV: "Formato CSV inválido", EMPTY_RECORD: "Registro vacío", INVALID_COLUMNS: "Número de columnas inválido",
  INVALID_NAME: "Nombre inválido", INVALID_EMAIL: "Correo inválido", DUPLICATE_EMAIL: "Correo repetido en el archivo",
};
