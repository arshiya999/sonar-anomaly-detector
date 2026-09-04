"""Sonar ingest adapters. Only formats with working parsers are advertised as supported."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

import numpy as np


@dataclass
class SonarFrame:
    frame_id: str
    survey_id: str
    image: np.ndarray
    timestamp: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    heading: float | None = None
    depth: float | None = None
    altitude: float | None = None
    range_m: float | None = None
    ping_number: int | None = None
    resolution: tuple[float | None, float | None] = (None, None)
    channel: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class SonarDataSource(Protocol):
    def connect(self) -> None: ...
    def disconnect(self) -> None: ...
    def read_frames(self) -> list[SonarFrame]: ...
    def is_connected(self) -> bool: ...
    def describe(self) -> str: ...
