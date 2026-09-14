import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function configuration() {
  const origin = process.env.BYETERY_WEB_ORIGIN ?? "http://127.0.0.1:3000";
  const upstream = process.env.BYETERY_API_URL ?? "http://127.0.0.1:3001";
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(upstream) ||
    url !== "https://aemxuqnnwfclzrwwiqfd.supabase.co" ||
    !key?.startsWith("sb_publishable_")
  )
    throw new Error("DEV configuration required");
  return { origin, upstream, url, key };
}
export async function authClient() {
  const config = configuration(),
    jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        for (const { name, value, options } of items)
          jar.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: "strict",
            secure: false,
          });
      },
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(12000),
          redirect: "error",
        }),
    },
  });
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === configuration().origin;
}
export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
  });
}
export function error(status: number, code: string) {
  return json({ error: { code, requestId: crypto.randomUUID() } }, status);
}
export async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new Error("JSON required");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Body required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32768) {
      await reader.cancel();
      throw new Error("Too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}
