export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(friendly(status, code));
  }
}
export function friendly(status: number, code = "") {
  if (status === 504 || code === "OutcomeUnknown")
    return "Resultado incierto. Consulta el estado o reintenta la misma operación; no se considera fallida.";
  if (code === "AuthRejected")
    return "No pudimos autenticarte. Revisa tus datos y confirma tu correo si corresponde.";
  const messages: Record<number, string> = {
    400: "Revisa los datos enviados.",
    401: "Tu sesión terminó. Inicia sesión para continuar.",
    403: "Tu usuario no tiene permiso para esta acción.",
    404: "No encontramos el registro solicitado.",
    409: "La operación entra en conflicto con el estado actual. Actualiza la información.",
    422: "Los datos o la evidencia no son válidos.",
    429: "Demasiadas solicitudes. Espera un momento.",
  };
  return (
    messages[status] ??
    "El servicio no está disponible. Conserva la operación y consulta su estado antes de volver a intentarlo."
  );
}
export async function request<T>(
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              ...(key ? { "Idempotency-Key": key } : {}),
            },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(35000),
    });
  } catch {
    throw new ApiFailure(504, "OutcomeUnknown");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(new Event("byetery:unauthorized"));
    throw new ApiFailure(response.status, data.error?.code ?? "ApiError");
  }
  return data as T;
}
export function batteryPath(id: string) {
  return "/battery/" + encodeURIComponent(id.trim().toUpperCase());
}
export function qrValue(id: string) {
  return batteryPath(id);
}
export interface WalletSigner {
  name: string;
  signMessage(input: {
    address: string;
    message: Uint8Array;
  }): Promise<Uint8Array>;
}
export function evidencePayload(
  batteryId: string,
  requestId: string,
  kind: "COLLECTION" | "RECYCLING",
  note: string,
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ batteryId, requestId, kind, note }),
  );
  return {
    evidence: {
      batteryId,
      requestId,
      kind,
      manifestBase64: btoa(
        Array.from(bytes, (b) => String.fromCharCode(b)).join(""),
      ),
    },
  };
}
