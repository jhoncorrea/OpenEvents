import { useEffect, useRef, useState } from "react";
import { cameraMessages, startQrCamera } from "./qr-camera";

interface Props { disabled: boolean; onRead: (code: string) => void; onActiveChange: (active: boolean) => void }
export default function CameraQrScanner({ disabled, onRead, onActiveChange }: Props) {
  const video = useRef<HTMLVideoElement>(null); const stop = useRef<(() => void) | null>(null);
  const [active, setActive] = useState(false); const [error, setError] = useState("");
  useEffect(() => () => { stop.current?.(); stop.current = null; }, []);
  useEffect(() => {
    if (disabled && stop.current) { stop.current(); stop.current = null; setActive(false); onActiveChange(false); }
  }, [disabled, onActiveChange]);
  function cancel() { stop.current?.(); stop.current = null; setActive(false); setError(""); onActiveChange(false); }
  function start() {
    if (disabled || stop.current || !video.current) return;
    setError(""); setActive(true); onActiveChange(true);
    stop.current = startQrCamera(video.current, code => {
      stop.current = null; setActive(false); onActiveChange(false); onRead(code);
    }, kind => { stop.current = null; setActive(false); onActiveChange(false); setError(cameraMessages[kind]); });
  }
  return <section aria-label="Leer credencial con cámara">
    <p>Lee el QR con la cámara o ingresa el código manualmente. Leerlo no registra el ingreso: debes confirmarlo con el botón.</p>
    {!active ? <button type="button" disabled={disabled} onClick={start}>Iniciar cámara</button> :
      <button type="button" onClick={cancel}>Detener cámara</button>}
    <video ref={video} muted playsInline hidden={!active} aria-label="Vista previa de la cámara" style={{ width: "100%", maxWidth: 480 }} />
    {active && <p role="status">Esperando permiso o lectura de cámara. Apunta al QR; puedes detener la cámara y usar el código manual.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
