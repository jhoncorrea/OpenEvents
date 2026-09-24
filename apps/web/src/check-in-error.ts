export type CheckInErrorKind = "configuration" | "validation" | "authentication" |
  "interaction_required" | "unauthorized" | "forbidden" | "not_found" |
  "not_active" | "uncertain" | "cancelled";

const messages: Record<CheckInErrorKind, string> = {
  configuration: "Revisa la configuración de acceso a la API.",
  validation: "Escribe un código de entre 1 y 256 caracteres.",
  authentication: "No pudimos obtener acceso. Vuelve a comprobar la sesión.",
  interaction_required: "Vuelve a comprobar el acceso para renovar la autorización con Microsoft.",
  unauthorized: "Tu acceso ya no es válido. Vuelve a comprobar la sesión.",
  forbidden: "No tienes permiso para registrar ingresos en este evento.",
  not_found: "El evento no está disponible o ya no tienes acceso.",
  not_active: "El evento no está activo. Consulta su estado actual.",
  uncertain: "No pudimos confirmar el ingreso. Podría haberse registrado. Puedes reenviar explícitamente el código: si ya ingresó, se mostrará como duplicado, siempre que conserve validez y permisos.",
  cancelled: "Se canceló la espera. Si el guardado ya se envió, podría haberse completado.",
};

export class CheckInError extends Error {
  constructor(readonly kind: CheckInErrorKind) {
    super(messages[kind]); this.name = "CheckInError";
  }
}
