"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as {
        status?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Přihlášení se nepovedlo.");
        return;
      }
      router.replace(from.startsWith("/") ? from : "/");
      router.refresh();
    } catch {
      setError("Chyba sítě.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">MOTT — přihlášení</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lokální účty (viz AUTH_SECRET a seed uživatele).
        </p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="block text-sm font-medium text-slate-700">
            Uživatelské jméno
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Heslo
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "Přihlašuji…" : "Přihlásit"}
          </button>
        </form>
      </div>
    </div>
  );
}
