/** QR is an identifier only. No URL normalization, percent decoding or remote navigation. */
export function batteryFromQr(value: string): string | null {
  const match = /^\/battery\/([A-Z0-9-]{1,32})$/.exec(value);
  return match?.[0] === value ? match[1] : null;
}
type Detector = {
  detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};
export function startCamera(
  video: HTMLVideoElement,
  onCode: (value: string) => void,
  onError: (message: string) => void,
): () => void {
  let stopped = false,
    stream: MediaStream | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  const canvas = document.createElement("canvas");
  function stop() {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    canvas.width = 0;
    canvas.height = 0;
  }
  async function run() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("NoCamera");
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      if (stopped) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      let detector: Detector | null = null;
      const Native = (
        globalThis as typeof globalThis & { BarcodeDetector?: DetectorClass }
      ).BarcodeDetector;
      try {
        if (Native && (await Native.getSupportedFormats()).includes("qr_code"))
          detector = new Native({ formats: ["qr_code"] });
      } catch {
        /* local decoder below */
      }
      let decode: typeof import("jsqr").default | undefined;
      async function frame() {
        if (stopped) return;
        try {
          let value: string | undefined;
          if (video.readyState >= 2) {
            if (detector) {
              try {
                value = (await detector.detect(video))[0]?.rawValue;
              } catch {
                detector = null;
              }
            }
            if (!detector) {
              decode ??= (await import("jsqr")).default;
              if (stopped) return;
              const width = Math.min(video.videoWidth, 960),
                height = Math.round(
                  (video.videoHeight * width) / video.videoWidth,
                );
              if (width && height) {
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d", {
                  willReadFrequently: true,
                });
                if (!context) throw new Error("NoCanvas");
                context.drawImage(video, 0, 0, width, height);
                const pixels = context.getImageData(0, 0, width, height);
                value = decode(pixels.data, width, height, {
                  inversionAttempts: "attemptBoth",
                })?.data;
                context.clearRect(0, 0, width, height);
              }
            }
          }
          if (stopped) return;
          if (value !== undefined) {
            stop();
            onCode(value);
            return;
          }
          timer = setTimeout(() => {
            void frame();
          }, 180);
        } catch {
          if (!stopped) {
            stop();
            onError(
              "No pudimos leer la cámara. Puedes ingresar el ID manualmente.",
            );
          }
        }
      }
      if (!stopped) void frame();
    } catch (error) {
      if (stopped) return;
      stop();
      onError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Permiso de cámara rechazado. Puedes ingresar el ID manualmente."
          : "Cámara no disponible. Revisa que no esté en uso o ingresa el ID manualmente.",
      );
    }
  }
  void run();
  return stop;
}
