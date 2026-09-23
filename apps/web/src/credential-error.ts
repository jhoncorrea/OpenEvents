export type CredentialErrorKind = "configuration" | "validation" | "authentication" | "interaction_required" | "unauthorized" | "forbidden" | "event_not_found" | "registration_not_found" | "exists" | "not_allowed" | "cancelled_before_send" | "uncertain";
const messages: Record<CredentialErrorKind, string> = {
  configuration: "La emisión no está configurada correctamente. No se envió la solicitud.",
  validation: "Revisa los identificadores de la inscripción. No se pudo aceptar la solicitud.",
  authentication: "No se pudo obtener acceso. Vuelve a comprobar tu sesión.",
  interaction_required: "Vuelve a comprobar el acceso antes de emitir.",
  unauthorized: "Tu sesión no permite emitir. Vuelve a comprobar el acceso.",
  forbidden: "No tienes permisos para emitir esta credencial.",
  event_not_found: "El evento ya no está disponible para tu cuenta.",
  registration_not_found: "La inscripción ya no está disponible en este evento.",
  exists: "Esta inscripción ya tiene una credencial. No podemos recuperar ni reemplazar su código.",
  not_allowed: "El estado del evento o de la inscripción no permite emitir una credencial.",
  cancelled_before_send: "La operación se canceló antes de enviar la solicitud.",
  uncertain: "No podemos confirmar el resultado. La credencial podría haberse emitido. No vuelvas a emitir para intentar recuperar el código; este recorrido no permite recuperarlo.",
};
export class CredentialError extends Error {
  constructor(readonly kind: CredentialErrorKind) { super(messages[kind]); this.name = "CredentialError"; }
}
