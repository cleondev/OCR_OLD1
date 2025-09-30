from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime
from typing import Generator, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from .config import CONFIG


def _enforce_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


class Base(DeclarativeBase):
    pass


class OcrRun(Base):
    __tablename__ = "ocr_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    original_file: Mapped[str] = mapped_column(String(1024), nullable=False)
    original_mime: Mapped[Optional[str]] = mapped_column(String(128))
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    engine_used: Mapped[Optional[str]] = mapped_column(String(64))
    extras_json: Mapped[Optional[str]] = mapped_column(Text)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    images: Mapped[list[OcrImage]] = relationship("OcrImage", back_populates="run", cascade="all, delete-orphan")
    results: Mapped[list[OcrResult]] = relationship("OcrResult", back_populates="run", cascade="all, delete-orphan")

    def set_extra(self, data: dict | None) -> None:
        self.extras_json = json.dumps(data, ensure_ascii=False) if data else None

    def get_extra(self) -> dict:
        return json.loads(self.extras_json) if self.extras_json else {}


class OcrImage(Base):
    __tablename__ = "ocr_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("ocr_runs.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer)
    step: Mapped[Optional[str]] = mapped_column(String(128))
    metadata_json: Mapped[Optional[str]] = mapped_column(Text)

    run: Mapped[OcrRun] = relationship("OcrRun", back_populates="images")

    def set_metadata(self, data: dict | None) -> None:
        self.metadata_json = json.dumps(data, ensure_ascii=False) if data else None

    def get_metadata(self) -> dict:
        return json.loads(self.metadata_json) if self.metadata_json else {}


class OcrResult(Base):
    __tablename__ = "ocr_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("ocr_runs.id", ondelete="CASCADE"), nullable=False)
    engine: Mapped[str] = mapped_column(String(64), nullable=False)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    extra_json: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    run: Mapped[OcrRun] = relationship("OcrRun", back_populates="results")

    def set_extra(self, data: dict | None) -> None:
        self.extra_json = json.dumps(data, ensure_ascii=False) if data else None

    def get_extra(self) -> dict:
        return json.loads(self.extra_json) if self.extra_json else {}


engine: Engine = create_engine(CONFIG.database.url, future=True, echo=False)


@event.listens_for(engine, "connect")
def _on_connect(dbapi_connection, connection_record):
    _enforce_foreign_keys(dbapi_connection, connection_record)


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
