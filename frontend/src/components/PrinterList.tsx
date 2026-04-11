"use client";

import { Printer } from "@/lib/api";

type Props = {
  printers: Printer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
};

export function PrinterList({
  printers,
  selectedId,
  onSelect,
  onRefresh,
  loading,
}: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Imprimantes détectées</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {printers.length} imprimante{printers.length > 1 ? "s" : ""} trouvée
            {printers.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          {loading ? "..." : "Actualiser"}
        </button>
      </div>

      {printers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Aucune imprimante détectée. Branchez une imprimante USB ESC/POS et
          cliquez sur Actualiser.
        </div>
      ) : (
        <ul className="space-y-2">
          {printers.map((p) => {
            const selected = p.id === selectedId;
            return (
              <li key={p.id}>
                <button
                  onClick={() => onSelect(p.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selected
                      ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/50"
                      : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {p.vendor ?? "?"} · {p.connection.toUpperCase()} ·{" "}
                        {p.width_dots} dots · {p.device_path}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          p.online ? "bg-emerald-500" : "bg-zinc-400"
                        }`}
                      />
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {p.online ? "En ligne" : "Hors ligne"}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
