from typing import Optional

from pydantic import BaseModel, Field


class TicketItem(BaseModel):
    name: str
    quantity: float = 1
    unit_price: float
    # Computed client-side or server-side — we recompute on the server
    # to avoid trusting the client.

    @property
    def total(self) -> float:
        return round(self.quantity * self.unit_price, 2)


class TicketData(BaseModel):
    shop_name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    items: list[TicketItem] = Field(default_factory=list)
    tax_rate: float = 0.0  # percent, e.g. 20.0
    currency: str = "EUR"
    footer: Optional[str] = "Merci de votre visite !"
    qr_url: Optional[str] = None
    barcode: Optional[str] = None
    width_dots: int = 512
