import os
import json
import sqlite3
import logging
from contextlib import contextmanager
from typing import List, Dict, Any, Optional

logger = logging.getLogger("SmartClassroomAgent.EventBuffer")


class EventBuffer:
    def __init__(self, db_path: str = "agent_buffer.db", max_size: int = 500):
        self.db_path = os.path.abspath(db_path)
        self.max_size = max_size
        self._init_db()

    @contextmanager
    def _connection(self):
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self):
        with self._connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS event_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT UNIQUE NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'pending'
                );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_status ON event_queue(status);")
            conn.commit()

    def enqueue(self, envelope: Dict[str, Any]) -> bool:
        """
        Appends an event envelope to the local queue. Prevents duplicates based on event_id.
        """
        event_id = envelope.get("event_id")
        if not event_id:
            logger.warning("Refusing to buffer event without event_id")
            return False

        try:
            payload_str = json.dumps(envelope)
            with self._connection() as conn:
                conn.execute(
                    "INSERT OR IGNORE INTO event_queue (event_id, payload, status) VALUES (?, ?, 'pending')",
                    (event_id, payload_str),
                )
                conn.commit()

            self._prune_overflow()
            return True
        except Exception as e:
            logger.error(f"Failed to buffer event {event_id}: {e}")
            return False

    def peek(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Retrieves up to `limit` pending events in FIFO order.
        """
        events = []
        try:
            with self._connection() as conn:
                cursor = conn.execute(
                    "SELECT payload FROM event_queue WHERE status = 'pending' ORDER BY id ASC LIMIT ?",
                    (limit,),
                )
                for row in cursor.fetchall():
                    try:
                        events.append(json.loads(row["payload"]))
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Failed to read buffered events: {e}")
        return events

    def acknowledge(self, event_ids: List[str]):
        """
        Removes successfully transmitted events from the queue.
        """
        if not event_ids:
            return

        try:
            with self._connection() as conn:
                placeholders = ",".join("?" for _ in event_ids)
                conn.execute(
                    f"DELETE FROM event_queue WHERE event_id IN ({placeholders})",
                    event_ids,
                )
                conn.commit()
            logger.debug(f"Acknowledged and deleted {len(event_ids)} events from buffer")
        except Exception as e:
            logger.error(f"Failed to acknowledge events in buffer: {e}")

    def count(self) -> int:
        """Returns number of pending events."""
        try:
            with self._connection() as conn:
                cursor = conn.execute("SELECT COUNT(*) as cnt FROM event_queue WHERE status = 'pending'")
                row = cursor.fetchone()
                return row["cnt"] if row else 0
        except Exception:
            return 0

    def _prune_overflow(self):
        """Drops oldest events if queue exceeds max_size."""
        try:
            with self._connection() as conn:
                cursor = conn.execute("SELECT COUNT(*) as cnt FROM event_queue")
                row = cursor.fetchone()
                total = row["cnt"] if row else 0
                if total > self.max_size:
                    excess = total - self.max_size
                    conn.execute(
                        "DELETE FROM event_queue WHERE id IN (SELECT id FROM event_queue ORDER BY id ASC LIMIT ?)",
                        (excess,),
                    )
                    conn.commit()
                    logger.warning(f"Buffer overflow: pruned {excess} oldest events to enforce limit {self.max_size}")
        except Exception as e:
            logger.error(f"Error during buffer pruning: {e}")

    def clear(self):
        with self._connection() as conn:
            conn.execute("DELETE FROM event_queue")
            conn.commit()
