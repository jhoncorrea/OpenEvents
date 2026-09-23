import { useMemo } from "react";
import { createCredentialQr } from "./credential-qr";

export default function RegistrationCredentialQr({ token }: { token: string }) {
  const drawing = useMemo(() => {
    try { return createCredentialQr(token); }
    catch { return null; }
  }, [token]);

  if (!drawing) return <p role="alert">No se pudo mostrar el QR. Puedes copiar el código de credencial.</p>;

  return <figure className="registration-credential-qr">
    <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR de la credencial de inscripción"
      viewBox={`0 0 ${drawing.extent} ${drawing.extent}`} width={drawing.extent * 8} height={drawing.extent * 8}
      focusable="false" shapeRendering="crispEdges">
      <rect width={drawing.extent} height={drawing.extent} fill="#fff" />
      <path d={drawing.path} fill="#000" />
    </svg>
    <figcaption>Este QR contiene el mismo código de credencial. Al salir o recargar, dejará de estar disponible en esta vista.</figcaption>
  </figure>;
}
