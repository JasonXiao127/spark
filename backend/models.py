import re
from sqlalchemy import Column, Integer, String
from pydantic import BaseModel, ConfigDict, Field, field_validator

from database import Base

# SQLAlchemy DB Model
class DeviceDB(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    mac_address = Column(String(17), unique=True, nullable=False)

# Pydantic Models
class DeviceBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    mac_address: str = Field(max_length=17)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        normalized = v.strip()
        if not normalized:
            raise ValueError("Device name cannot be blank")
        return normalized

    @field_validator("mac_address")
    @classmethod
    def validate_mac_address(cls, v: str) -> str:
        # Normalize: remove any dashes/colons, then join uppercase with colons
        cleaned = v.strip().replace("-", "").replace(":", "").upper()
        if not re.fullmatch(r"[0-9A-F]{12}", cleaned):
            raise ValueError(
                "MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX"
            )
        first_octet = int(cleaned[:2], 16)
        if cleaned == "0" * 12 or first_octet & 1:
            raise ValueError("MAC address must identify a unicast, non-zero device")
        # Store as uppercase colon-separated
        return ":".join(cleaned[i:i+2] for i in range(0, 12, 2))

class DeviceCreate(DeviceBase):
    pass

class Device(DeviceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
