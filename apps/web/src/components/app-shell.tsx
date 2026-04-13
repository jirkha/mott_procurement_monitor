"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Zakázky" },
  { href: "/sprava", label: "Správa" },
];

function navClass(active: boolean) {
  return active
    ? "font-medium text-blue-700"
    : "text-slate-600 transition hover:text-slate-900";
}

export type AppShellUser = { username: string; role: string };

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: AppShellUser | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <div className="flex items-baseline gap-3">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-slate-900"
            >
              MOTT
            </Link>
            <span className="hidden text-xs text-slate-400 sm:inline">
              Monitoring veřejných zakázek
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <nav
              className="flex flex-wrap gap-x-6 gap-y-1 text-sm"
              aria-label="Hlavní navigace"
            >
              {NAV.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={navClass(active)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {user ? (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="hidden sm:inline" title={user.role}>
                  {user.username}
                </span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                >
                  Odhlásit
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
