from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .converter.router import router as converter_router
from .history.router import router as history_router
from .print_job.router import router as print_router
from .printers.router import router as printers_router
from .status.router import router as status_router
from .ticket.router import router as ticket_router

app = FastAPI(
    title="ThermalPrint Studio",
    description="Universal ESC/POS thermal printer control",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(printers_router)
app.include_router(converter_router)
app.include_router(print_router)
app.include_router(status_router)
app.include_router(ticket_router)
app.include_router(history_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "thermalprint", "version": "0.1.0"}
