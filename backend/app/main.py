from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .converter.router import router as converter_router
from .printers.router import router as printers_router

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


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "thermalprint", "version": "0.1.0"}
