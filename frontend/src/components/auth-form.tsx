"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { request } from "@/lib/client";
import { useSession } from "./session";
export function AuthForm({ signup = false }: { signup?: boolean }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  const { refresh } = useSession(),
    router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFailure("");
    setMessage("");
    const form = new FormData(e.currentTarget);
    try {
      const result = await request<{ confirmationRequired: boolean }>(
        "/auth/" + (signup ? "signup" : "login"),
        { email: form.get("email"), password: form.get("password") },
      );
      if (result.confirmationRequired) {
        setMessage(
          "Revisa tu correo para confirmar la cuenta y luego inicia sesión aquí.",
        );
      } else {
        await refresh();
        router.push("/dashboard");
      }
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <p className="eyebrow">UNA SEGUNDA VIDA EMPIEZA CONTIGO</p>
        <h1>
          Pequeñas pilas.
          <br />
          <span>Un gran cambio.</span>
        </h1>
        <p>
          Devuelve tus pilas y sigue su recorrido, desde la solicitud hasta el
          reciclaje verificado.
        </p>
        <div className="battery-art" aria-hidden="true">
          <div>+</div>
          <span>↻</span>
        </div>
        <p className="caption">
          DEV / MOCK · Esta experiencia utiliza datos de desarrollo y
          recompensas simuladas.
        </p>
      </section>
      <section className="card auth-card">
        <p className="eyebrow">BIENVENIDO A BYETERY</p>
        <h2>{signup ? "Crea tu cuenta" : "Qué bueno verte"}</h2>
        <p>
          {signup
            ? "Participa en el recorrido de tus pilas."
            : "Entra para consultar y gestionar tus devoluciones."}
        </p>
        <form onSubmit={submit}>
          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={8}
              maxLength={256}
            />
          </label>
          <button disabled={busy}>
            {busy ? "Procesando…" : signup ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </form>
        {failure && (
          <p role="alert" className="notice error">
            {failure}
          </p>
        )}
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <p>
          {signup ? "¿Ya tienes cuenta?" : "¿Primera vez aquí?"}{" "}
          <Link href={signup ? "/login" : "/signup"}>
            {signup ? "Inicia sesión" : "Crea una cuenta"}
          </Link>
        </p>
      </section>
    </div>
  );
}
