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

type EditableSpan = TextSpan & { original: string };

type Annotation = {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  bold: boolean;
  color: string;
};

type Point = { x: number; y: number };

type Stroke = {
  id: string;
  color: string;
  width: number; // in source-image pixels
  points: Point[];
};

type Mode = "select" | "addText" | "draw";

type Props = {
  widthDots: number;
  onCompose: (blob: Blob) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
};

const DEFAULT_FONT_SIZE = 40;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const PALETTE = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

// Detect the global EyeDropper API in supported browsers without
// leaking `any` into every call site.
type EyeDropperResult = { sRGBHex: string };
type EyeDropperApi = { open: () => Promise<EyeDropperResult> };
function getEyeDropper(): EyeDropperApi | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    EyeDropper?: new () => EyeDropperApi;
  };
  return w.EyeDropper ? new w.EyeDropper() : null;
}

export function PdfEditor({ widthDots, onCompose, onError, disabled }: Props) {
  const [image, setImage] = useState<EditImageResponse | null>(null);
  const [spans, setSpans] = useState<EditableSpan[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

  const [selected, setSelected] = useState<
    | { kind: "span"; id: string }
    | { kind: "annotation"; id: string }
    | null
  >(null);

  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [mode, setMode] = useState<Mode>("select");
  const [zoom, setZoom] = useState(0.5);
  const [color, setColor] = useState<string>("#000000");
  const [brushSize, setBrushSize] = useState(6);

  const [dragState, setDragState] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);

  const displayScale = zoom;

  // Load the source image into an off-DOM element so composite + the
  // eyedropper fallback can read pixel data without re-fetching.
  useEffect(() => {
    if (!image) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = editImageUrl(image.edit_id);
    img.onload = () => {
      sourceImageRef.current = img;
    };
  }, [image]);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      onError("Merci de déposer un fichier PDF.");
      return;
    }
    setUploading(true);
    setAnnotations([]);
    setStrokes([]);
    setSelected(null);
    try {
      const res = await uploadPdfForEdit(file);
      setImage(res);
      setSpans(res.spans.map((s) => ({ ...s, original: s.text })));
      // Default zoom: fit the image width into the container so
      // everything is visible initially.
      const containerWidth = containerRef.current?.clientWidth ?? 600;
      const fit = Math.min(1, containerWidth / res.width);
      setZoom(Math.max(MIN_ZOOM, fit));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload échoué");
    } finally {
      setUploading(false);
    }
  };

  const toSourceCoords = (clientX: number, clientY: number): Point | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const scrollTop = containerRef.current.scrollTop;
    return {
      x: (clientX - rect.left + scrollLeft) / displayScale,
      y: (clientY - rect.top + scrollTop) / displayScale,
    };
  };

  const addAnnotationAt = (clientX: number, clientY: number) => {
    const pt = toSourceCoords(clientX, clientY);
    if (!pt) return;
    const id = Math.random().toString(36).slice(2, 10);
    setAnnotations((prev) => [
      ...prev,
      {
        id,
        x: pt.x,
        y: pt.y,
        text: "Texte",
        fontSize: DEFAULT_FONT_SIZE,
        bold: false,
        color,
      },
    ]);
    setSelected({ kind: "annotation", id });
    setMode("select");
  };

  const handleCanvasMouseDown = (e: RMouseEvent<HTMLDivElement>) => {
    if (mode === "addText") {
      if (e.target === e.currentTarget || e.target === imgRef.current) {
        addAnnotationAt(e.clientX, e.clientY);
      }
      return;
    }
    if (mode === "draw") {
      const pt = toSourceCoords(e.clientX, e.clientY);
      if (!pt) return;
      const id = Math.random().toString(36).slice(2, 10);
      setCurrentStroke({
        id,
        color,
        width: brushSize,
        points: [pt],
      });
    }
  };

  const handleCanvasMouseMove = (e: RMouseEvent<HTMLDivElement>) => {
    if (mode !== "draw" || !currentStroke) return;
    const pt = toSourceCoords(e.clientX, e.clientY);
    if (!pt) return;
    setCurrentStroke({
      ...currentStroke,
      points: [...currentStroke.points, pt],
    });
  };

  const handleCanvasMouseUp = () => {
    if (mode === "draw" && currentStroke) {
      if (currentStroke.points.length > 1) {
        setStrokes((prev) => [...prev, currentStroke]);
      }
      setCurrentStroke(null);
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

  const undoStroke = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const clearStrokes = () => {
    setStrokes([]);
  };

  const startDragAnnotation = (
    e: RMouseEvent<HTMLDivElement>,
    a: Annotation,
  ) => {
    e.stopPropagation();
    setSelected({ kind: "annotation", id: a.id });
    const pt = toSourceCoords(e.clientX, e.clientY);
    if (!pt) return;
    setDragState({
      id: a.id,
      offsetX: pt.x - a.x,
      offsetY: pt.y - a.y,
    });
  };

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (e: MouseEvent) => {
      const pt = toSourceCoords(e.clientX, e.clientY);
      if (!pt) return;
      updateAnnotation(dragState.id, {
        x: pt.x - dragState.offsetX,
        y: pt.y - dragState.offsetY,
      });
    };
    const handleUp = () => setDragState(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, displayScale]);

  const pickColorFromPdf = async () => {
    // Try the modern EyeDropper API first; fall back to image sampling.
    const eyedropper = getEyeDropper();
    if (eyedropper) {
      try {
        const r = await eyedropper.open();
        setColor(r.sRGBHex);
      } catch {
        // cancelled
      }
      return;
    }
    // Fallback: single-click sample from the underlying image canvas.
    onError(
      "Ton navigateur ne supporte pas la pipette système. Utilise la palette ou l'input couleur.",
    );
  };

  const buildComposite = useCallback(async (): Promise<Blob> => {
    if (!image) throw new Error("Aucun PDF chargé");

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non supporté");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let src = sourceImageRef.current;
    if (!src) {
      src = new Image();
      src.crossOrigin = "anonymous";
      src.src = editImageUrl(image.edit_id);
      await new Promise<void>((resolve, reject) => {
        src!.onload = () => resolve();
        src!.onerror = () => reject(new Error("Chargement image échoué"));
      });
      sourceImageRef.current = src;
    }
    ctx.drawImage(src, 0, 0);

    // Edited spans: white rectangle over original bbox, then new text.
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

    // Free-form text annotations.
    for (const a of annotations) {
      ctx.fillStyle = a.color;
      ctx.font = `${a.bold ? "bold " : ""}${a.fontSize}px sans-serif`;
      const lines = a.text.split("\n");
      lines.forEach((line, idx) => {
        ctx.fillText(line, a.x, a.y + idx * a.fontSize * 1.2);
      });
    }

    // Drawn strokes: quadratic-smoothed polylines.
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Export canvas échoué");
    return blob;
  }, [image, spans, annotations, strokes]);

  const handleSendToPrint = useCallback(async () => {
    setComposing(true);
    try {
      const blob = await buildComposite();
      onCompose(blob);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export échoué");
    } finally {
      setComposing(false);
    }
  }, [buildComposite, onCompose, onError]);

  const handleExport = useCallback(async () => {
    setComposing(true);
    try {
      const blob = await buildComposite();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export échoué");
    } finally {
      setComposing(false);
    }
  }, [buildComposite, onError]);

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
            Modifie le texte, dessine, exporte ou imprime
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
      {/* Mode toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {(
            [
              { key: "select" as Mode, label: "Sélection" },
              { key: "addText" as Mode, label: "+ Texte" },
              { key: "draw" as Mode, label: "Pinceau" },
            ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                mode === t.key
                  ? "bg-white shadow-sm dark:bg-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setImage(null);
            setSpans([]);
            setAnnotations([]);
            setStrokes([]);
          }}
          className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Nouveau PDF
        </button>
      </div>

      {/* Color + brush panel */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Couleur
        </span>
        <div className="flex gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-md border transition ${
                color === c
                  ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-8 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
          title="Choisir une couleur"
        />
        <button
          onClick={pickColorFromPdf}
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          title="Pipette — prélever une couleur de l'écran"
        >
          Pipette
        </button>
        {mode === "draw" && (
          <>
            <span className="ml-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Taille
            </span>
            <input
              type="range"
              min={1}
              max={40}
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-24"
            />
            <span className="w-6 text-xs text-zinc-500">{brushSize}</span>
            <button
              onClick={undoStroke}
              disabled={strokes.length === 0}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Annuler
            </button>
            <button
              onClick={clearStrokes}
              disabled={strokes.length === 0}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Tout effacer
            </button>
          </>
        )}
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span>Zoom</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="flex-1 max-w-[200px]"
        />
        <span className="w-10 text-right">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(1)}
          className="ml-1 rounded-md border border-zinc-200 px-2 py-0.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          100%
        </button>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {mode === "addText"
          ? "Clique sur le PDF pour ajouter un texte libre."
          : mode === "draw"
            ? "Clique et glisse pour dessiner."
            : "Clique sur un texte existant pour le modifier."}
      </p>

      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        className="w-full overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800"
        style={{
          maxHeight: 640,
          cursor:
            mode === "addText"
              ? "crosshair"
              : mode === "draw"
                ? "crosshair"
                : "default",
        }}
      >
        <div
          className="relative"
          style={{
            width: image.width * displayScale,
            height: image.height * displayScale,
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
              imageRendering: "auto",
            }}
          />

          {/* Editable spans */}
          {mode !== "draw" &&
            spans.map((s) => {
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
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={style}
                  spellCheck={false}
                />
              );
            })}

          {/* SVG overlay for strokes + in-progress stroke */}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={image.width * displayScale}
            height={image.height * displayScale}
            viewBox={`0 0 ${image.width} ${image.height}`}
          >
            {strokes.map((s) => (
              <polyline
                key={s.id}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
              />
            ))}
            {currentStroke && currentStroke.points.length > 1 && (
              <polyline
                fill="none"
                stroke={currentStroke.color}
                strokeWidth={currentStroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={currentStroke.points
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
              />
            )}
          </svg>

          {/* User-added annotations */}
          {annotations.map((a) => {
            const isSel = sel?.kind === "annotation" && sel.id === a.id;
            const style: CSSProperties = {
              position: "absolute",
              left: a.x * displayScale,
              top: a.y * displayScale,
              fontSize: a.fontSize * displayScale,
              fontWeight: a.bold ? 700 : 400,
              color: a.color,
              cursor: dragState?.id === a.id ? "grabbing" : "grab",
              padding: "2px 4px",
              background: isSel
                ? "rgba(59,130,246,0.15)"
                : "transparent",
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
                max={300}
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
            <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Couleur
              <input
                type="color"
                value={selectedAnnotation.color}
                onChange={(e) =>
                  updateAnnotation(selectedAnnotation.id, {
                    color: e.target.value,
                  })
                }
                className="h-5 w-6 rounded border border-zinc-300 dark:border-zinc-700"
              />
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

      <div className="flex gap-2">
        <button
          onClick={handleSendToPrint}
          disabled={disabled || composing}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {composing ? "..." : "Préparer pour impression"}
        </button>
        <button
          onClick={handleExport}
          disabled={composing}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          {composing ? "..." : "Exporter PNG"}
        </button>
      </div>
    </div>
  );
}
