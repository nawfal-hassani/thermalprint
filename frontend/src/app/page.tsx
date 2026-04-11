"use client";

import { useCallback, useEffect, useState } from "react";

import { PdfUploader } from "@/components/PdfUploader";
import { PrinterList } from "@/components/PrinterList";
import {
  ConvertResponse,
  Printer,
  convertPdf,
  fetchPrinters,
  previewUrl,
  printJob,
} from "@/lib/api";

export default function Home() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [converting, setConverting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [preview, setPreview] = useState<ConvertResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refreshPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    setError(null);
    try {
      const list = await fetchPrinters();
      setPrinters(list);
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    refreshPrinters();
  }, [refreshPrinters]);

  const handleFile = useCallback(
    async (file: File) => {
      setConverting(true);
      setError(null);
      setSuccess(null);
      setPreview(null);
      try {
        const selected = printers.find((p) => p.id === selectedId);
        const width = selected?.width_dots ?? 512;
        const result = await convertPdf(file, width, true);
        setPreview(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Conversion échouée");
      } finally {
        setConverting(false);
      }
    },
    [printers, selectedId],
  );

  const handlePrint = useCallback(async () => {
    if (!preview || !selectedId) return;
    setPrinting(true);
    setError(null);
    setSuccess(null);
    try {
      await printJob(selectedId, preview.job_id);
      setSuccess("Ticket envoyé à l'imprimante !");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impression échouée");
    } finally {
      setPrinting(false);
    }
  }, [preview, selectedId]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          ThermalPrint Studio
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Imprimez n&apos;importe quel PDF sur vos imprimantes thermiques
          ESC/POS.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          {success}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <PrinterList
          printers={printers}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRefresh={refreshPrinters}
          loading={loadingPrinters}
        />

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold">Imprimer un PDF</h2>
          {!preview ? (
            <PdfUploader
              onFile={handleFile}
              disabled={converting || !selectedId}
            />
          ) : (
            <div>
              <div className="mb-4 max-h-[420px] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl(preview.job_id)}
                  alt="Aperçu du ticket"
                  className="mx-auto block"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  disabled={printing || !selectedId}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {printing ? "Impression..." : "Imprimer"}
                </button>
                <button
                  onClick={() => {
                    setPreview(null);
                    setSuccess(null);
                  }}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
          {converting && (
            <div className="mt-4 text-center text-sm text-zinc-500">
              Conversion en cours...
            </div>
          )}
        </section>
      </div>

      <footer className="mt-10 text-center text-xs text-zinc-500 dark:text-zinc-500">
        ThermalPrint Studio
      </footer>
    </main>
  );
}
