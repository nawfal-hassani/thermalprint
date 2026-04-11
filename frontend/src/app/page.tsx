"use client";

import { useCallback, useEffect, useState } from "react";

import { PdfUploader } from "@/components/PdfUploader";
import { PrinterList } from "@/components/PrinterList";
import { TicketEditor } from "@/components/TicketEditor";
import {
  ConvertResponse,
  Printer,
  TicketData,
  convertPdf,
  fetchPrinters,
  previewUrl,
  printJob,
  renderTicket,
  scanNetwork,
} from "@/lib/api";

type Tab = "pdf" | "editor";

export default function Home() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [scanningNetwork, setScanningNetwork] = useState(false);
  const [converting, setConverting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [preview, setPreview] = useState<ConvertResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pdf");

  const selectedPrinter = printers.find((p) => p.id === selectedId);
  const widthDots = selectedPrinter?.width_dots ?? 512;

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

  const handleScanNetwork = useCallback(async () => {
    setScanningNetwork(true);
    setError(null);
    try {
      const netPrinters = await scanNetwork();
      setPrinters((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        return [...prev, ...netPrinters.filter((p) => !existing.has(p.id))];
      });
      setSuccess(
        netPrinters.length === 0
          ? "Aucune imprimante réseau trouvée."
          : `${netPrinters.length} imprimante(s) réseau ajoutée(s).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan réseau échoué");
    } finally {
      setScanningNetwork(false);
    }
  }, []);

  useEffect(() => {
    refreshPrinters();
  }, [refreshPrinters]);

  const handlePdfFile = useCallback(
    async (file: File) => {
      setConverting(true);
      setError(null);
      setSuccess(null);
      setPreview(null);
      try {
        const result = await convertPdf(file, widthDots, true);
        setPreview(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Conversion échouée");
      } finally {
        setConverting(false);
      }
    },
    [widthDots],
  );

  const handleRenderTicket = useCallback(
    async (data: TicketData) => {
      setConverting(true);
      setError(null);
      setSuccess(null);
      setPreview(null);
      try {
        const result = await renderTicket(data);
        setPreview(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Rendu échoué");
      } finally {
        setConverting(false);
      }
    },
    [],
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
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          ThermalPrint Studio
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Imprimez un PDF ou composez votre propre ticket.
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

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <PrinterList
          printers={printers}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRefresh={refreshPrinters}
          onScanNetwork={handleScanNetwork}
          scanningNetwork={scanningNetwork}
          loading={loadingPrinters}
        />

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {(["pdf", "editor"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setPreview(null);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === t
                    ? "bg-white shadow-sm dark:bg-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {t === "pdf" ? "Importer un PDF" : "Éditeur de ticket"}
              </button>
            ))}
          </div>

          {!preview ? (
            tab === "pdf" ? (
              <PdfUploader
                onFile={handlePdfFile}
                disabled={converting || !selectedId}
              />
            ) : (
              <TicketEditor
                widthDots={widthDots}
                onRender={handleRenderTicket}
                disabled={converting || !selectedId}
              />
            )
          ) : (
            <div>
              <div className="mb-4 max-h-[520px] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
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
                  Retour
                </button>
              </div>
            </div>
          )}
          {converting && (
            <div className="mt-4 text-center text-sm text-zinc-500">
              Génération en cours...
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
