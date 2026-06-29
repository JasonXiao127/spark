from sqlalchemy import Column, Integer, String
from pydantic import BaseModel, ConfigDict

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

class DeviceCreate(DeviceBase):
    pass

class Device(DeviceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int