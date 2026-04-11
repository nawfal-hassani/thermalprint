# ThermalPrint Studio

Une application web pour piloter n'importe quelle imprimante thermique ESC/POS depuis le navigateur. Glissez un PDF (facture, ticket), l'app le convertit automatiquement au format de l'imprimante et l'imprime.

## Fonctionnalités (MVP)

- ✅ Détection automatique des imprimantes USB (via `/dev/usb/lp*` + IEEE 1284)
- ✅ Import PDF → conversion en image thermique (recadrage auto des marges A4, redimensionnement à la largeur de l'imprimante, dithering Floyd-Steinberg)
- ✅ Aperçu avant impression
- ✅ Impression via `python-escpos`
- ✅ Interface web FR (Next.js + Tailwind)

## À venir

- Détection réseau (port 9100) et série
- Statut temps réel (papier, capot, erreurs) via WebSocket
- Éditeur de ticket from scratch (articles, logo, QR, code-barres)
- Historique d'impression & ré-impression

## Stack

| Côté | Tech |
|---|---|
| Backend | FastAPI · python-escpos · Pillow · poppler (pdftoppm) |
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind v4 |

## Installation

### Prérequis système

```bash
# Debian/Ubuntu
sudo apt install poppler-utils imagemagick python3 python3-pip

# Ton utilisateur doit être dans le groupe lp pour imprimer sans sudo
sudo usermod -aG lp $USER
# (déconnecte-toi puis reconnecte-toi)
```

### Backend

```bash
cd backend
pip install --user --break-system-packages -r requirements.txt
./run.sh
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger)
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

## API

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Ping |
| `GET` | `/api/printers` | Liste les imprimantes détectées |
| `POST` | `/api/convert/pdf` | Upload PDF → job_id + preview_url |
| `GET` | `/api/convert/preview/{job_id}` | Image PNG prête à imprimer |
| `POST` | `/api/print` | `{printer_id, job_id}` → envoie à l'imprimante |

## Structure

```
thermalprint/
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app + router wiring
│   │   ├── printers/           # détection USB/sysfs
│   │   ├── converter/          # PDF → PNG thermique
│   │   └── print_job/          # envoi à l'imprimante
│   ├── requirements.txt
│   └── run.sh
└── frontend/
    └── src/
        ├── app/page.tsx        # page principale
        ├── components/         # PrinterList, PdfUploader
        └── lib/api.ts          # client HTTP typé
```

## Imprimantes testées

- **Aures ODP333** (chipset Sewoo, 80mm, 512 dots) ✅

## Licence

Privée.
