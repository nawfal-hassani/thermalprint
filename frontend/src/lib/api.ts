export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type Printer = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  connection: "usb" | "network" | "serial";
  device_path: string;
  width_dots: number;
  online: boolean;
  raw_id: string | null;
};

export type ConvertResponse = {
  job_id: string;
  preview_url: string;
  width_dots: number;
};

export async function fetchPrinters(): Promise<Printer[]> {
  const res = await fetch(`${API_BASE}/api/printers`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch printers: ${res.status}`);
  return res.json();
}

export async function convertPdf(
  file: File,
  widthDots: number,
  trim: boolean,
): Promise<ConvertResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("width_dots", String(widthDots));
  form.append("trim", String(trim));

  const res = await fetch(`${API_BASE}/api/convert/pdf`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Conversion failed: ${res.status}`);
  return res.json();
}

export async function printJob(
  printerId: string,
  jobId: string,
  cut: boolean = true,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printer_id: printerId, job_id: jobId, cut }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Print failed");
  }
}

export function previewUrl(jobId: string): string {
  return `${API_BASE}/api/convert/preview/${jobId}`;
}

export type PrinterStatus = {
  printer_id: string;
  online: boolean;
  cover_open: boolean;
  paper_ok: boolean;
  paper_near_end: boolean;
  paper_empty: boolean;
  error: boolean;
  cutter_error: boolean;
  reachable: boolean;
  message?: string | null;
};

export function statusWsUrl(printerId: string): string {
  const base = API_BASE.replace(/^http/, "ws");
  return `${base}/api/status/ws/${encodeURIComponent(printerId)}`;
}

export async function scanNetwork(subnet?: string): Promise<Printer[]> {
  const url = new URL(`${API_BASE}/api/printers/scan-network`);
  if (subnet) url.searchParams.set("subnet", subnet);
  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) throw new Error(`Network scan failed: ${res.status}`);
  return res.json();
}
