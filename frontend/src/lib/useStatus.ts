"use client";

import { useEffect, useState } from "react";

import { PrinterStatus, statusWsUrl } from "./api";

export function usePrinterStatus(printerId: string | null): PrinterStatus | null {
  const [status, setStatus] = useState<PrinterStatus | null>(null);

  useEffect(() => {
    if (!printerId) {
      setStatus(null);
      return;
    }

    let ws: WebSocket | null = null;
    let cancelled = false;

    try {
      ws = new WebSocket(statusWsUrl(printerId));
    } catch {
      return;
    }

    ws.onmessage = (ev) => {
      if (cancelled) return;
      try {
        setStatus(JSON.parse(ev.data));
      } catch {
        // ignore
      }
    };
    ws.onerror = () => setStatus(null);

    return () => {
      cancelled = true;
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, [printerId]);

  return status;
}
