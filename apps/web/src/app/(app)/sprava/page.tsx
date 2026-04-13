import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Správa — MOTT",
  description: "Správa monitoringu zakázek",
};

export default function SpravaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Správa</h1>
        <p className="mt-2 text-slate-600">
          Tato část bude sloužit pro administraci zdrojů, disciplín, štítků a
          uživatelů. Zatím jde o zástupnou stránku v rámci základního rozhraní
          aplikace.
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">Přihlašování zatím není aktivní</p>
        <p className="mt-1 text-amber-900/90">
          Podle vývojového plánu přijde detailní přihlašování a oprávnění až po
          rozšíření stahování zakázek na všechny relevantní zdroje. Do té doby je
          aplikace určena pouze pro lokální vývoj.
        </p>
      </div>

      <nav className="grid gap-3 sm:grid-cols-2" aria-label="Podstránky správy">
        <Link
          href="/sprava/zdroje"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="font-semibold text-slate-900">Zdroje</h2>
          <p className="mt-1 text-sm text-slate-600">
            Přehled napojených zdrojů a počtu zakázek v databázi.
          </p>
        </Link>
        <Link
          href="/sprava/sber"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow"
        >
          <h2 className="font-semibold text-slate-900">Historie sběru</h2>
          <p className="mt-1 text-sm text-slate-600">
            Poslední běhy ručního sběru (IngestionRun) a statistiky.
          </p>
        </Link>
      </nav>

      <p className="text-sm text-slate-500">
        <Link href="/" className="text-blue-700 hover:text-blue-600">
          ← Zpět na přehled zakázek
        </Link>
      </p>
    </div>
  );
}
