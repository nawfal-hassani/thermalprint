"use client";

import {
  CSSProperties,
  MouseEvent as RMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  EditImageResponse,
  TextSpan,
  editImageUrl,
  uploadPdfForEdit,
} from "@/lib/api";

// A span whose user-facing text may have diverged from the original
// extracted from the PDF. Position/size stay locked.
type EditableSpan = TextSpan & { original: string };

// Free-form annotation added by the user with a click.
type Annotation = {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  bold: boolean;
};

type Props = {
  widthDots: number;
  onCompose: (blob: Blob) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
};

const DEFAULT_FONT_SIZE = 28;
const MAX_DISPLAY_WIDTH = 560;

export function PdfEditor({ widthDots, onCompose, onError, disabled }: Props) {
  const [image, setImage] = useState<EditImageResponse | null>(null);
  const [spans, setSpans] = useState<EditableSpan[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selected, setSelected] = useState<
    | { kind: "span"; id: string }
    | { kind: "annotation"; id: string }
    | null
  >(null);
  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [dragState, setDragState] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [mode, setMode] = useState<"select" | "addText">("select");

  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayScale = image
    ? Math.min(1, MAX_DISPLAY_WIDTH / image.width)
    : 1;

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      onError("Merci de déposer un fichier PDF.");
      return;
    }
    setUploading(true);
    setAnnotations([]);
    setSelected(null);
    try {
      const res = await uploadPdfForEdit(file);
      setImage(res);
      setSpans(res.spans.map((s) => ({ ...s, original: s.text })));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload échoué");
    } finally {
      setUploading(false);
    }
  };

  const addAnnotationAt = (clientX: number, clientY: number) => {
    if (!image || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = containerRef.current.scrollTop;
    const x = (clientX - rect.left) / displayScale;
    const y = (clientY - rect.top + scrollTop) / displayScale;
    const id = Math.random().toString(36).slice(2, 10);
    setAnnotations((prev) => [
      ...prev,
      { id, x, y, text: "Texte", fontSize: DEFAULT_FONT_SIZE, bold: false },
    ]);
    setSelected({ kind: "annotation", id });
    setMode("select");
  };

  const handleCanvasClick = (e: RMouseEvent<HTMLDivElement>) => {
    if (mode !== "addText") return;
    if (e.target === e.currentTarget || e.target === imgRef.current) {
      addAnnotationAt(e.clientX, e.clientY);
    }
  };

  const updateSpan = (id: string, patch: Partial<EditableSpan>) => {
    setSpans((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const resetSpan = (id: string) => {
    setSpans((prev) =>
      prev.map((s) => (s.id === id ? { ...s, text: s.original } : s)),
    );
  };

  const updateAnnotation = (id: string, patch: Partial<Annotation>) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setSelected(null);
  };

  const startDragAnnotation = (
    e: RMouseEvent<HTMLDivElement>,
    a: Annotation,
  ) => {
    e.stopPropagation();
    setSelected({ kind: "annotation", id: a.id });
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scrollTop = containerRef.current?.scrollTop ?? 0;
    setDragState({
      id: a.id,
      offsetX: (e.clientX - rect.left) / displayScale - a.x,
      offsetY: (e.clientY - rect.top + scrollTop) / displayScale - a.y,
    });
  };

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scrollTop = containerRef.current?.scrollTop ?? 0;
      updateAnnotation(dragState.id, {
        x: (e.clientX - rect.left) / displayScale - dragState.offsetX,
        y: (e.clientY - rect.top + scrollTop) / displayScale - dragState.offsetY,
      });
    };
    const handleUp = () => setDragState(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, displayScale]);

  const composite = useCallback(async () => {
    if (!image) return;
    setComposing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas non supporté");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const src = new Image();
      src.crossOrigin = "anonymous";
      src.src = editImageUrl(image.edit_id);
      await new Promise<void>((resolve, reject) => {
        src.onload = () => resolve();
        src.onerror = () => reject(new Error("Impossible de charger l'image"));
      });
      ctx.drawImage(src, 0, 0);

      // For every span that was modified, cover the original glyphs
      // with white and paint the new text in their place.
      ctx.textBaseline = "top";
      for (const s of spans) {
        if (s.text === s.original) continue;
        const pad = 2;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(
          s.x - pad,
          s.y - pad,
          s.width + pad * 2,
          s.height + pad * 2,
        );
        ctx.fillStyle = "#000000";
        ctx.font = `${s.bold ? "bold " : ""}${s.font_size}px sans-serif`;
        ctx.fillText(s.text, s.x, s.y);
      }

      // Free-form annotations on top.
      for (const a of annotations) {
        ctx.fillStyle = "#000000";
        ctx.font = `${a.bold ? "bold " : ""}${a.fontSize}px sans-serif`;
        const lines = a.text.split("\n");
        lines.forEach((line, idx) => {
          ctx.fillText(line, a.x, a.y + idx * a.fontSize * 1.2);
        });
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Export canvas échoué");
      onCompose(blob);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export échoué");
    } finally {
      setComposing(false);
    }
  }, [image, spans, annotations, onCompose, onError]);

  if (!image) {
    return (
      <div className="space-y-3">
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className="cursor-pointer rounded-2xl border-2 border-dashed border-zinc-300 p-10 text-center hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div className="font-medium">Charger un PDF à éditer</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Modifie le texte existant ou ajoute-en, puis imprime
          </div>
        </div>
        {uploading && (
          <div className="text-center text-sm text-zinc-500">
            Extraction du texte...
          </div>
        )}
      </div>
    );
  }

  const sel = selected;
  const selectedSpan =
    sel?.kind === "span" ? spans.find((s) => s.id === sel.id) : undefined;
  const selectedAnnotation =
    sel?.kind === "annotation"
      ? annotations.find((a) => a.id === sel.id)
      : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          <button
            onClick={() => setMode("select")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              mode === "select"
                ? "bg-white shadow-sm dark:bg-zinc-900"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Sélection
          </button>
          <button
            onClick={() => setMode("addText")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              mode === "addText"
                ? "bg-white shadow-sm dark:bg-zinc-900"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            + Ajouter texte
          </button>
        </div>
        <button
          onClick={() => {
            setImage(null);
            setSpans([]);
            setAnnotations([]);
          }}
          className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Nouveau PDF
        </button>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {mode === "addText"
          ? "Clique sur le PDF pour ajouter un texte libre."
          : "Clique sur un texte existant pour le modifier. Double-clique pour éditer directement."}
      </p>

      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        className="relative mx-auto overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800"
        style={{
          width: image.width * displayScale,
          maxHeight: 560,
          cursor: mode === "addText" ? "crosshair" : "default",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={editImageUrl(image.edit_id)}
          alt="PDF"
          draggable={false}
          style={{
            width: image.width * displayScale,
            height: image.height * displayScale,
            display: "block",
            userSelect: "none",
          }}
        />

        {/* Editable text spans — one <input> per span, positioned
            absolutely with the source bbox scaled to display size.
            White background masks the underlying glyphs so the user
            sees only their own text. */}
        {spans.map((s) => {
          const modified = s.text !== s.original;
          const isSel = sel?.kind === "span" && sel.id === s.id;
          const style: CSSProperties = {
            position: "absolute",
            left: s.x * displayScale,
            top: s.y * displayScale,
            width: Math.max(s.width * displayScale, 40),
            minHeight: s.height * displayScale,
            fontSize: s.font_size * displayScale,
            fontWeight: s.bold ? 700 : 400,
            lineHeight: 1.1,
            color: "#000",
            background: modified
              ? "rgba(255,255,255,0.95)"
              : "rgba(255,255,255,0.01)",
            border: isSel
              ? "1px solid rgba(59,130,246,0.9)"
              : "1px solid transparent",
            outline: "none",
            padding: 0,
            margin: 0,
            fontFamily: "sans-serif",
            cursor: "text",
          };
          return (
            <input
              key={s.id}
              type="text"
              value={s.text}
              onChange={(e) => updateSpan(s.id, { text: e.target.value })}
              onFocus={() => setSelected({ kind: "span", id: s.id })}
              onClick={(e) => e.stopPropagation()}
              style={style}
              spellCheck={false}
            />
          );
        })}

        {/* User-added annotations */}
        {annotations.map((a) => {
          const isSel = sel?.kind === "annotation" && sel.id === a.id;
          const style: CSSProperties = {
            position: "absolute",
            left: a.x * displayScale,
            top: a.y * displayScale,
            fontSize: a.fontSize * displayScale,
            fontWeight: a.bold ? 700 : 400,
            color: "#000",
            cursor: dragState?.id === a.id ? "grabbing" : "grab",
            padding: "2px 4px",
            background: isSel
              ? "rgba(59,130,246,0.15)"
              : "rgba(255,255,255,0.8)",
            border: isSel
              ? "1px dashed rgba(59,130,246,0.8)"
              : "1px dashed transparent",
            whiteSpace: "pre",
            lineHeight: 1.2,
            fontFamily: "sans-serif",
            userSelect: "none",
          };
          return (
            <div
              key={a.id}
              style={style}
              onMouseDown={(e) => startDragAnnotation(e, a)}
              onClick={(e) => {
                e.stopPropagation();
                setSelected({ kind: "annotation", id: a.id });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const next = prompt("Texte :", a.text);
                if (next !== null) updateAnnotation(a.id, { text: next });
              }}
            >
              {a.text || "…"}
            </div>
          );
        })}
      </div>

      {selectedSpan && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Texte du PDF
          </div>
          <input
            value={selectedSpan.text}
            onChange={(e) =>
              updateSpan(selectedSpan.id, { text: e.target.value })
            }
            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Original : « {selectedSpan.original} »</span>
            {selectedSpan.text !== selectedSpan.original && (
              <button
                onClick={() => resetSpan(selectedSpan.id)}
                className="ml-auto rounded-md border border-zinc-200 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Restaurer
              </button>
            )}
          </div>
        </div>
      )}

      {selectedAnnotation && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Texte ajouté
          </div>
          <textarea
            rows={2}
            value={selectedAnnotation.text}
            onChange={(e) =>
              updateAnnotation(selectedAnnotation.id, { text: e.target.value })
            }
            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Taille
              <input
                type="number"
                min={8}
                max={200}
                value={selectedAnnotation.fontSize}
                onChange={(e) =>
                  updateAnnotation(selectedAnnotation.id, {
                    fontSize: parseInt(e.target.value) || DEFAULT_FONT_SIZE,
                  })
                }
                className="w-16 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={selectedAnnotation.bold}
                onChange={(e) =>
                  updateAnnotation(selectedAnnotation.id, {
                    bold: e.target.checked,
                  })
                }
              />
              Gras
            </label>
            <button
              onClick={() => removeAnnotation(selectedAnnotation.id)}
              className="ml-auto rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950/40"
            >
              Supprimer
            </button>
          </div>
        </div>
      )}

      <button
        onClick={composite}
        disabled={disabled || composing}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {composing ? "Génération..." : "Générer l'aperçu d'impression"}
      </button>
    </div>
  );
}
