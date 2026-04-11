"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
};

export function PdfUploader({ onFile, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
        alert("Merci de déposer un fichier PDF.");
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
        dragOver
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg
          className="h-6 w-6 text-zinc-600 dark:text-zinc-300"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16.5V9m0 0-3 3m3-3 3 3m-8.25 5.25h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 16.5 4.5h-9a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      </div>
      <div className="font-medium">Glissez votre PDF ici</div>
      <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        ou cliquez pour parcourir
      </div>
    </div>
  );
}
