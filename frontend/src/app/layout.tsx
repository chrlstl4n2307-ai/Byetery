import type { Metadata } from "next";
import { SessionProvider, Shell } from "@/components/session";
import "./globals.css";
import { configuration } from "@/lib/server";
import { WebRuntimeProvider } from "@/components/web-runtime";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Byetery · Cada batería cuenta",
  description:
    "Trazabilidad de baterías y verificación de atestaciones autorizadas.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  const { runtime } = configuration();
  return (
    <html lang="es">
      <body>
        <a className="skip" href="#main">
          Saltar al contenido
        </a>
        <WebRuntimeProvider value={runtime}>
          <SessionProvider>
            <Shell>{children}</Shell>
          </SessionProvider>
        </WebRuntimeProvider>
      </body>
    </html>
  );
}
