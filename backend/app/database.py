from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import ROOT, settings


class Base(DeclarativeBase):
    pass


def _engine_url() -> str:
    url = (settings.database_url or "").strip()
    local_pg = "127.0.0.1:5432" in url or "localhost:5432" in url
    # Render free web services have no Postgres on localhost.
    if os.getenv("RENDER") and local_pg:
        db_path = ROOT / "data" / "aqua_vision.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{db_path}"
    if url.startswith("sqlite:///"):
        raw = url.removeprefix("sqlite:///")
        Path(raw).parent.mkdir(parents=True, exist_ok=True)
    return url


_url = _engine_url()
_kwargs: dict = {"pool_pre_ping": True}
if _url.startswith("sqlite"):
    _kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(_url, **_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
