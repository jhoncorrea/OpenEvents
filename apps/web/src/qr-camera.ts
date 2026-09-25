import jsQR from "jsqr";

export type CameraErrorKind = "insecure" | "unsupported" | "permission" | "missing" | "unavailable" | "hidden" | "invalid";
export const cameraMessages: Record<CameraErrorKind, string> = {
  insecure: "La cámara necesita HTTPS o localhost. Puedes ingresar el código manualmente.",
  unsupported: "Este navegador no ofrece acceso a la cámara. Usa el ingreso manual.",
  permission: "No se permitió usar la cámara. Revisa el permiso del navegador o usa el ingreso manual.",
  missing: "No se encontró una cámara disponible. Puedes ingresar el código manualmente.",
  unavailable: "No pudimos usar la cámara. Puede estar ocupada o desconectada. Usa el ingreso manual o vuelve a intentarlo.",
  hidden: "La cámara se detuvo al ocultar la página. Pulsa Iniciar cámara para continuar.",
  invalid: "El QR leído no tiene formato de credencial de OpenEvents. No se envió ningún ingreso.",
};

// El formato local no autoriza el ingreso: el servidor valida credencial, evento y permisos.
export function isCredentialQr(value: string): boolean {
  return /^oe1_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
}
export function decodeQrFrame(data: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

/** La cancelación es inmediata incluso si el usuario deja el permiso sin responder. */
export function startQrCamera(video: HTMLVideoElement, onRead: (code: string) => void, onError: (kind: CameraErrorKind) => void): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let canvas: HTMLCanvasElement | null = null;
  const ended = () => fail("unavailable");
  const visibility = () => { if (document.hidden) fail("hidden"); };
  function stop() {
    if (stopped) return;
    stopped = true; clearTimeout(timer);
    document.removeEventListener("visibilitychange", visibility);
    if (stream) {
      for (const track of stream.getTracks()) { track.removeEventListener("ended", ended); track.stop(); }
      if (video.srcObject === stream) { video.pause(); video.srcObject = null; }
      stream = null;
    }
    if (canvas) { canvas.width = 0; canvas.height = 0; canvas = null; }
  }
  function fail(kind: CameraErrorKind) { if (!stopped) { stop(); onError(kind); } }
  async function begin() {
    try {
      if (!window.isSecureContext) { fail("insecure"); return; }
      if (!navigator.mediaDevices?.getUserMedia) { fail("unsupported"); return; }
      if (document.hidden) { fail("hidden"); return; }
      document.addEventListener("visibilitychange", visibility);
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 },
      } });
      if (stopped) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired;
      if (!stream.getVideoTracks().some(track => track.readyState === "live")) { fail("missing"); return; }
      stream.getTracks().forEach(track => track.addEventListener("ended", ended));
      video.srcObject = stream;
      await video.play();
      if (stopped) return;
      canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) { fail("unavailable"); return; }
      function scan() {
        if (stopped || !canvas) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            const ratio = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight);
            canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
            canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
            context!.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context!.getImageData(0, 0, canvas.width, canvas.height);
            const value = decodeQrFrame(frame.data, frame.width, frame.height);
            if (value !== null) {
              stop();
              if (isCredentialQr(value)) onRead(value); else onError("invalid");
              return;
            }
          }
          timer = setTimeout(scan, 250);
        } catch { fail("unavailable"); }
      }
      scan();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      fail(name === "NotAllowedError" || name === "SecurityError" ? "permission" : name === "NotFoundError" ? "missing" : "unavailable");
    }
  }
  // Posponer la apertura permite al llamador guardar la función de parada antes de cualquier callback.
  void Promise.resolve().then(() => { if (!stopped) void begin(); });
  return stop;
}
