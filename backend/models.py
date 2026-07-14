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
    ip_address = Column(String, nullable=False)

# Pydantic Models
class DeviceBase(BaseModel):
    name: str
    mac_address: str
    ip_address: str

    @field_validator("mac_address")
    @classmethod
    def validate_mac_address(cls, v: str) -> str:
        if not re.match(r"^([0-9A-Fa-f]{2}(:|-)){5}[0-9A-Fa-f]{2}$", v):
            raise ValueError(
                "MAC address must be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX"
            )
        return v

    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, v: str) -> str:
        if not re.match(
            r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$", v
        ):
            raise ValueError("IP address must be in format XXX.XXX.XXX.XXX")
        parts = v.split(".")
        for part in parts:
            if not 0 <= int(part) <= 255:
                raise ValueError("Each octet of IP address must be between 0 and 255")
        return v

class DeviceCreate(DeviceBase):
    pass

class Device(DeviceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
