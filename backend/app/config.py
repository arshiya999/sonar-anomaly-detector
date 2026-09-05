from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT / ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://aqua:aqua@127.0.0.1:5432/aqua_vision"
    model_path: str = str(ROOT / "ml" / "weights" / "sonar-debris-yolo11n.pt")
    storage_dir: str = str(ROOT / "data" / "aqua_storage")
    cors_origins: str = "*"
    max_upload_mb: int = 64
    log_level: str = "INFO"
    host: str = "0.0.0.0"
    port: int = 8765


settings = Settings()
STORAGE = Path(settings.storage_dir)
STORAGE.mkdir(parents=True, exist_ok=True)
