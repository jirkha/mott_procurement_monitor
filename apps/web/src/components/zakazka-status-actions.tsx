"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  zakazkaId: string;
  initialStatus: "NEW" | "IN_PROGRESS" | "CLOSED" | "IRRELEVANT";
};

export default function ZakazkaStatusActions({
  zakazkaId,
  initialStatus,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const patchStatus = async (next: "NEW" | "IRRELEVANT") => {
    if (pending || next === status) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/zakazky/${zakazkaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as { status?: string; error?: string };
      if (!res.ok || data.status !== "ok") {
        setMessage(data.error ?? "Změna se nezdařila.");
        return;
      }
      setStatus(next);
      setMessage(next === "IRRELEVANT" ? "Označeno jako irelevantní." : "Stav vrácen na nové.");
      router.refresh();
    } catch {
      setMessage("Chyba spojení.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">Relevance vůči zadání</h2>
      <p className="mb-3 text-xs text-slate-600">
        Stav <strong>irelevantní</strong> vyřadí zakázku z výchozího přehledu (lze zobrazit
        volitelným filtrem).
      </p>
      <p className="mb-3 text-sm text-slate-700">
        Aktuální stav:{" "}
        <span className="font-medium">
          {status === "IRRELEVANT" ? "Irelevantní" : status === "IN_PROGRESS" ? "V řešení" : status === "CLOSED" ? "Uzavřeno" : "Nové / neučeno"}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {status !== "IRRELEVANT" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void patchStatus("IRRELEVANT")}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Označit jako irelevantní
          </button>
        )}
        {status === "IRRELEVANT" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void patchStatus("NEW")}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Vrátit jako relevantní (NEW)
          </button>
        )}
      </div>
      {message && (
        <p className="mt-2 text-xs text-slate-600" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
