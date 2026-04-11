from typing import Literal, Optional

from pydantic import BaseModel

ConnectionType = Literal["usb", "network", "serial"]


class Printer(BaseModel):
    id: str
    name: str
    vendor: Optional[str] = None
    model: Optional[str] = None
    connection: ConnectionType
    device_path: str
    width_dots: int = 512
    online: bool = True
    raw_id: Optional[str] = None
