from __future__ import annotations

import asyncio
import json
import queue
from collections import defaultdict

from fastapi import WebSocket

pending: queue.Queue[tuple[str, dict]] = queue.Queue()


def emit(room: str, payload: dict) -> None:
    pending.put((room, payload))


class Hub:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def join(self, room: str, ws: WebSocket) -> None:
        async with self._lock:
            self._rooms[room].add(ws)

    async def leave(self, room: str, ws: WebSocket) -> None:
        async with self._lock:
            self._rooms[room].discard(ws)

    async def broadcast(self, room: str, payload: dict) -> None:
        dead: list[WebSocket] = []
        async with self._lock:
            peers = list(self._rooms.get(room, ()))
        text = json.dumps(payload, default=str)
        for ws in peers:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._rooms[room].discard(ws)


hub = Hub()
