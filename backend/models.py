import re
from sqlalchemy import Column, Integer, String
from pydantic import BaseModel, ConfigDict, field_validator

from database import Base

# SQLAlchemy DB Model
class DeviceDB(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    mac_address = Column(String, unique=True, nullable=False)

# Pydantic Models
class DeviceBase(BaseModel):
    name: str
    mac_address: str

    @field_validator("mac_address")
    @classmethod
    def validate_mac_address(cls, v: str) -> str:
        # Normalize: remove any dashes/colons, then join uppercase with colons
        cleaned = v.replace("-", "").replace(":", "").upper()
        if not re.match(r"^[0-9A-F]{12}$", cleaned):
            raise ValueError(
                "MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX"
            )
        # Store as uppercase colon-separated
        return ":".join(cleaned[i:i+2] for i in range(0, 12, 2))

class DeviceCreate(DeviceBase):
    pass

class Device(DeviceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
