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
  editImageUrl,
  uploadPdfForEdit,
} from "@/lib/api";

type TextAnnotation = {
  id: string;
  x: number;       // position in source-image coordinates (pixels)
  y: number;
  text: string;
  fontSize: number; // in source-image pixels
  bold: boolean;
};

type Props = {
  widthDots: number;
  onCompose: (blob: Blob) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
};

const DEFAULT_FONT_SIZE = 28;
const MAX_DISPLAY_WIDTH = 520;

export function PdfEditor({ widthDots, onCompose, onError, disabled }: Props) {
  const [image, setImage] = useState<EditImageResponse | null>(null);
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [dragState, setDragState] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Display scale: shrink the source image to fit the panel.
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
    setSelectedId(null);
    try {
      const res = await uploadPdfForEdit(file);
      setImage(res);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload échoué");
    } finally {
      setUploading(false);
    }
  };

  const addAnnotationAt = (clientX: number, clientY: number) => {
    if (!image || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / displayScale;
    const y = (clientY - rect.top) / displayScale;
    const id = Math.random().toString(36).slice(2, 10);
    setAnnotations((prev) => [
      ...prev,
      {
        id,
        x,
        y,
        text: "Texte",
        fontSize: DEFAULT_FONT_SIZE,
        bold: false,
      },
    ]);
    setSelectedId(id);
  };

  const handleCanvasClick = (e: RMouseEvent<HTMLDivElement>) => {
    // Only add when clicking the background (not an existing annotation).
    if (e.target === e.currentTarget || e.target === imgRef.current) {
      addAnnotationAt(e.clientX, e.clientY);
    }
  };

  const updateAnnotation = (id: string, patch: Partial<TextAnnotation>) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const startDrag = (
    e: RMouseEvent<HTMLDivElement>,
    annotation: TextAnnotation,
  ) => {
    e.stopPropagation();
    setSelectedId(annotation.id);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragState({
      id: annotation.id,
      offsetX: (e.clientX - rect.left) / displayScale - annotation.x,
      offsetY: (e.clientY - rect.top) / displayScale - annotation.y,
    });
  };

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      updateAnnotation(dragState.id, {
        x: (e.clientX - rect.left) / displayScale - dragState.offsetX,
        y: (e.clientY - rect.top) / displayScale - dragState.offsetY,
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
      // Draw source image + every annotation onto an offscreen canvas
      // at native source resolution so we don't lose quality.
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

      ctx.fillStyle = "#000000";
      ctx.textBaseline = "top";
      for (const a of annotations) {
        ctx.font = `${a.bold ? "bold " : ""}${a.fontSize}px sans-serif`;
        // Draw each line separately for multi-line entries.
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
  }, [image, annotations, onCompose, onError]);

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
            Ajoute du texte par-dessus, puis imprime
          </div>
        </div>
        {uploading && (
          <div className="text-center text-sm text-zinc-500">
            Chargement du PDF...
          </div>
        )}
      </div>
    );
  }

  const selected = annotations.find((a) => a.id === selectedId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Clique sur le PDF pour ajouter du texte. Glisse pour déplacer.
        </p>
        <button
          onClick={() => {
            setImage(null);
            setAnnotations([]);
          }}
          className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Nouveau PDF
        </button>
      </div>

      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        className="relative mx-auto overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800"
        style={{
          width: image.width * displayScale,
          height: image.height * displayScale,
          maxHeight: 520,
          overflowY: "auto",
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
        {annotations.map((a) => {
          const style: CSSProperties = {
            position: "absolute",
            left: a.x * displayScale,
            top: a.y * displayScale,
            fontSize: a.fontSize * displayScale,
            fontWeight: a.bold ? 700 : 400,
            color: "#000",
            cursor: dragState?.id === a.id ? "grabbing" : "grab",
            padding: "2px 4px",
            background:
              selectedId === a.id ? "rgba(59,130,246,0.15)" : "transparent",
            border:
              selectedId === a.id
                ? "1px dashed rgba(59,130,246,0.8)"
                : "1px dashed transparent",
            whiteSpace: "pre",
            lineHeight: 1.2,
            fontFamily: "sans-serif",
          };
          return (
            <div
              key={a.id}
              style={style}
              onMouseDown={(e) => startDrag(e, a)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(a.id);
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

      {selected && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Élément sélectionné
          </div>
          <textarea
            rows={2}
            value={selected.text}
            onChange={(e) =>
              updateAnnotation(selected.id, { text: e.target.value })
            }
            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Taille
              <input
                type="number"
                min={8}
                max={120}
                value={selected.fontSize}
                onChange={(e) =>
                  updateAnnotation(selected.id, {
                    fontSize: parseInt(e.target.value) || DEFAULT_FONT_SIZE,
                  })
                }
                className="w-16 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={selected.bold}
                onChange={(e) =>
                  updateAnnotation(selected.id, { bold: e.target.checked })
                }
              />
              Gras
            </label>
            <button
              onClick={() => removeAnnotation(selected.id)}
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
