"use client";

import { useCallback, useEffect, useState } from "react";

import {
  HistoryEntry,
  deleteHistory,
  fetchHistory,
  historyPreviewUrl,
  renameHistory,
  reprintHistory,
} from "@/lib/api";

type Props = {
  currentPrinterId: string | null;
  refreshSignal: number;
  onMessage: (msg: { success?: string; error?: string }) => void;
};

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function HistoryList({
  currentPrinterId,
  refreshSignal,
  onMessage,
}: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await fetchHistory());
    } catch (e) {
      onMessage({
        error: e instanceof Error ? e.message : "Erreur chargement historique",
      });
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshSignal]);

  const handleReprint = async (entry: HistoryEntry) => {
    setReprintingId(entry.id);
    try {
      await reprintHistory(entry.id, currentPrinterId ?? undefined);
      onMessage({ success: `Ré-impression de « ${entry.title} » envoyée` });
    } catch (e) {
      onMessage({
        error: e instanceof Error ? e.message : "Ré-impression échouée",
      });
    } finally {
      setReprintingId(null);
    }
  };

  const startEdit = (entry: HistoryEntry) => {
    setEditingId(entry.id);
    setEditTitle(entry.title);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const saveEdit = async (entry: HistoryEntry) => {
    const next = editTitle.trim();
    if (!next || next === entry.title) {
      cancelEdit();
      return;
    }
    try {
      const updated = await renameHistory(entry.id, next);
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
    } catch (e) {
      onMessage({
        error: e instanceof Error ? e.message : "Renommage échoué",
      });
    } finally {
      cancelEdit();
    }
  };

  const handleDownload = async (entry: HistoryEntry) => {
    try {
      const res = await fetch(historyPreviewUrl(entry.id));
      if (!res.ok) throw new Error("Téléchargement échoué");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = entry.title.replace(/[^a-zA-Z0-9-_]+/g, "_") || "ticket";
      a.download = `${safe}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      onMessage({
        error: e instanceof Error ? e.message : "Téléchargement échoué",
      });
    }
  };

  const handleDelete = async (entry: HistoryEntry) => {
    try {
      await deleteHistory(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (e) {
      onMessage({
        error: e instanceof Error ? e.message : "Suppression échouée",
      });
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Historique</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {entries.length} impression{entries.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          {loading ? "..." : "Actualiser"}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Aucune impression pour l&apos;instant.
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={historyPreviewUrl(entry.id)}
                alt={entry.title}
                className="h-20 w-14 rounded border border-zinc-200 bg-white object-contain dark:border-zinc-700"
              />
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  {editingId === entry.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(entry);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={() => saveEdit(entry)}
                        className="flex-1 rounded-md border border-blue-400 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-blue-600 dark:bg-zinc-900"
                      />
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {entry.source}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(entry)}
                        className="truncate text-left font-medium hover:text-blue-600 dark:hover:text-blue-400"
                        title="Cliquer pour renommer"
                      >
                        {entry.title}
                      </button>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {entry.source}
                      </span>
                    </div>
                  )}
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(entry.created_at)} · {entry.printer_name}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleReprint(entry)}
                    disabled={reprintingId === entry.id}
                    className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {reprintingId === entry.id ? "..." : "Ré-imprimer"}
                  </button>
                  <button
                    onClick={() => handleDownload(entry)}
                    className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Télécharger
                  </button>
                  <button
                    onClick={() => startEdit(entry)}
                    className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Renommer
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
                    className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950/40"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
