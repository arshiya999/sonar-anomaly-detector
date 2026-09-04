from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class MetadataReader:
    """JSON / CSV ping-header sidecars. Does not invent coordinates."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def read(self) -> dict[str, Any]:
        if self.path.suffix.lower() == ".json":
            data = json.loads(self.path.read_text())
            return data if isinstance(data, dict) else {}
        if self.path.suffix.lower() == ".csv":
            lines = self.path.read_text().strip().splitlines()
            if len(lines) < 2:
                return {}
            keys = [k.strip() for k in lines[0].split(",")]
            vals = [v.strip() for v in lines[1].split(",")]
            return dict(zip(keys, vals, strict=False))
        raise ValueError(f"Unsupported metadata format: {self.path.suffix}")
