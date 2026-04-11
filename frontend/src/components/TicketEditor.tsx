"use client";

import { useState } from "react";

import { TicketData, TicketItem } from "@/lib/api";

type Props = {
  widthDots: number;
  onRender: (data: TicketData) => void;
  disabled?: boolean;
};

const emptyItem = (): TicketItem => ({ name: "", quantity: 1, unit_price: 0 });

export function TicketEditor({ widthDots, onRender, disabled }: Props) {
  const [shopName, setShopName] = useState("MON MAGASIN");
  const [address, setAddress] = useState("123 rue de Paris, 75000 Paris");
  const [phone, setPhone] = useState("01 23 45 67 89");
  const [items, setItems] = useState<TicketItem[]>([
    { name: "Article 1", quantity: 1, unit_price: 5.0 },
  ]);
  const [taxRate, setTaxRate] = useState(20);
  const [currency, setCurrency] = useState("EUR");
  const [qrUrl, setQrUrl] = useState("");
  const [footer, setFooter] = useState("Merci de votre visite !");

  const updateItem = (idx: number, patch: Partial<TicketItem>) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const handleRender = () => {
    onRender({
      shop_name: shopName,
      address: address || undefined,
      phone: phone || undefined,
      items: items.filter((it) => it.name.trim()),
      tax_rate: taxRate,
      currency,
      footer: footer || undefined,
      qr_url: qrUrl || undefined,
      width_dots: widthDots,
    });
  };

  const input =
    "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900";
  const label = "block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className={label}>Nom du magasin</label>
          <input
            className={input}
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Adresse</label>
            <input
              className={input}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Téléphone</label>
            <input
              className={input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium">Articles</label>
          <button
            onClick={addItem}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            + Ajouter
          </button>
        </div>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <input
                className={`${input} col-span-6`}
                placeholder="Nom"
                value={it.name}
                onChange={(e) => updateItem(idx, { name: e.target.value })}
              />
              <input
                className={`${input} col-span-2`}
                type="number"
                step="1"
                min="0"
                placeholder="Qté"
                value={it.quantity}
                onChange={(e) =>
                  updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })
                }
              />
              <input
                className={`${input} col-span-3`}
                type="number"
                step="0.01"
                min="0"
                placeholder="Prix"
                value={it.unit_price}
                onChange={(e) =>
                  updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })
                }
              />
              <button
                onClick={() => removeItem(idx)}
                className="col-span-1 rounded-lg border border-zinc-200 text-sm text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950/40"
                aria-label="Supprimer"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label}>TVA (%)</label>
          <input
            className={input}
            type="number"
            step="0.1"
            value={taxRate}
            onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className={label}>Devise</label>
          <input
            className={input}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>QR code (URL)</label>
          <input
            className={input}
            placeholder="https://..."
            value={qrUrl}
            onChange={(e) => setQrUrl(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={label}>Message de pied</label>
        <input
          className={input}
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
          <span>Sous-total</span>
          <span>
            {subtotal.toFixed(2)} {currency}
          </span>
        </div>
        <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
          <span>TVA {taxRate}%</span>
          <span>
            {tax.toFixed(2)} {currency}
          </span>
        </div>
        <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1 font-semibold dark:border-zinc-700">
          <span>TOTAL</span>
          <span>
            {total.toFixed(2)} {currency}
          </span>
        </div>
      </div>

      <button
        onClick={handleRender}
        disabled={disabled || items.length === 0}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Générer l&apos;aperçu
      </button>
    </div>
  );
}
