"use client";

import { PrinterStatus } from "@/lib/api";

type Props = { status: PrinterStatus | null };

export function StatusBadge({ status }: Props) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        Statut inconnu
      </span>
    );
  }

  const items: { label: string; tone: "ok" | "warn" | "err" }[] = [];

  if (!status.reachable) {
    items.push({ label: "Injoignable", tone: "err" });
  } else if (!status.online) {
    items.push({ label: "Hors ligne", tone: "err" });
  } else {
    items.push({ label: "En ligne", tone: "ok" });
  }

  if (status.cover_open) items.push({ label: "Capot ouvert", tone: "err" });
  if (status.paper_empty) items.push({ label: "Pas de papier", tone: "err" });
  else if (status.paper_near_end)
    items.push({ label: "Papier faible", tone: "warn" });
  if (status.cutter_error) items.push({ label: "Coupe bloquée", tone: "err" });
  if (status.error) items.push({ label: "Erreur", tone: "err" });

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, idx) => (
        <span
          key={idx}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
            it.tone === "ok"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              : it.tone === "warn"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              it.tone === "ok"
                ? "bg-emerald-500"
                : it.tone === "warn"
                  ? "bg-amber-500"
                  : "bg-red-500"
            }`}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
