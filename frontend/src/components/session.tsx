"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ApiFailure, request } from "@/lib/client";
import type { Profile, Role } from "@/lib/types";
type User = { id: string; email?: string };
type Session = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};
const Context = createContext<Session>({
  user: null,
  profile: null,
  loading: true,
  error: "",
  refresh: async () => {},
});
export const useSession = () => useContext(Context);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Session, "refresh">>({
    user: null,
    profile: null,
    loading: true,
    error: "",
  });
  const refresh = useCallback(async () => {
    try {
      const { user } = await request<{ user: User }>("/auth/session");
      const profile = await request<Profile>("/api/me");
      setState({ user, profile, loading: false, error: "" });
    } catch (e) {
      setState({
        user: null,
        profile: null,
        loading: false,
        error:
          e instanceof ApiFailure && e.status === 401
            ? ""
            : e instanceof Error
              ? e.message
              : "No fue posible recuperar la sesión.",
      });
    }
  }, []);
  useEffect(() => {
    let active = true;
    const update = () => {
      if (active) void refresh();
    };
    const expired = () =>
      setState({
        user: null,
        profile: null,
        loading: false,
        error: "Tu sesión terminó. Vuelve a iniciar sesión.",
      });
    update();
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    window.addEventListener("byetery:unauthorized", expired);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("byetery:unauthorized", expired);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ ...state, refresh }}>
      {children}
    </Context.Provider>
  );
}
export const navigation = [
  { href: "/dashboard", label: "Mi actividad" },
  { href: "/admin", label: "Administración", role: "ADMIN" },
  { href: "/collector", label: "Recolección", role: "COLLECTOR" },
  { href: "/recycler", label: "Reciclaje", role: "RECYCLER" },
] as const;
export function RoleNavigation({ roles }: { roles: Role[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Navegación principal">
      {navigation
        .filter((item) => !("role" in item) || roles.includes(item.role))
        .map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={path === item.href ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
    </nav>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const { user, profile, refresh } = useSession();
  const router = useRouter();
  const [error, setError] = useState("");
  async function logout() {
    try {
      await request("/auth/logout", {});
      await refresh();
      router.replace("/login");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">↻</span> byetery
          <span className="brand-dot">.</span>
        </Link>
        <div className="environment">
          <span>
            Environment: <b>DEV</b>
          </span>
          <span>
            Blockchain source: <b>MOCK</b>
          </span>
        </div>
        <div className="account">
          {user ? (
            <>
              <span>{user.email}</span>
              <button className="text-button" onClick={logout}>
                Salir
              </button>
            </>
          ) : (
            <Link href="/login">Iniciar sesión</Link>
          )}
        </div>
      </header>
      <div className="shell">
        {user && (
          <aside>
            <p className="eyebrow">TU ESPACIO CIRCULAR</p>
            <RoleNavigation roles={profile?.roles ?? []} />
            <div className="sidebar-note">
              Cada pila tiene una historia.
              <br />
              <strong>Hagamos que termine bien.</strong>
              <p>Entorno de demostración. Sin transacciones en Stellar.</p>
            </div>
          </aside>
        )}
        <main id="main">
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {children}
        </main>
      </div>
      <footer>
        Byetery · Devoluciones trazables · Recompensas simuladas GREEN-TEST
      </footer>
    </>
  );
}
export function Gate({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, profile, loading, error } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user && !error) router.replace("/login");
  }, [loading, user, error, router]);
  if (loading) return <p role="status">Comprobando sesión…</p>;
  if (!user)
    return (
      <section className="card">
        <h1>Inicia sesión para continuar</h1>
        {error && <p role="alert">{error}</p>}
        <Link href="/login">Ir a iniciar sesión</Link>
      </section>
    );
  if (role && !profile?.roles.includes(role))
    return (
      <section className="card">
        <h1>Acceso restringido</h1>
        <p>Tu usuario no tiene permiso para este panel.</p>
      </section>
    );
  return children;
}
