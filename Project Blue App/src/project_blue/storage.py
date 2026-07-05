from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class BlueStorage:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(database_path)
        self.connection.row_factory = sqlite3.Row
        self.fts_enabled = False

    def close(self) -> None:
        self.connection.close()

    def initialize(self) -> None:
        self.connection.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                owner TEXT NOT NULL,
                provenance TEXT NOT NULL,
                sensitivity TEXT NOT NULL,
                retention TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_events (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT UNIQUE NOT NULL,
                occurred_at TEXT NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                result TEXT NOT NULL,
                details_json TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                event_hash TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                details TEXT NOT NULL,
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY,
                action_type TEXT NOT NULL,
                summary TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                status TEXT NOT NULL,
                requested_at TEXT NOT NULL,
                decided_at TEXT,
                decided_by TEXT,
                decision_note TEXT
            );
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                provider TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sources (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                original_path TEXT NOT NULL,
                media_type TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                content TEXT NOT NULL,
                added_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS citations (
                id TEXT PRIMARY KEY,
                memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
                source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                locator TEXT NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(memory_id, source_id, locator)
            );
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversation_entries (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                provider TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS execution_receipts (
                id TEXT PRIMARY KEY,
                approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
                executor TEXT NOT NULL,
                outcome TEXT NOT NULL,
                details TEXT NOT NULL,
                occurred_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                root_path TEXT UNIQUE NOT NULL,
                mode TEXT NOT NULL,
                created_at TEXT NOT NULL,
                indexed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS workspace_files (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                relative_path TEXT NOT NULL,
                size INTEGER NOT NULL,
                modified_at REAL NOT NULL,
                sha256 TEXT NOT NULL,
                content TEXT NOT NULL,
                indexed_at TEXT NOT NULL,
                UNIQUE(workspace_id, relative_path)
            );
            CREATE TABLE IF NOT EXISTS proposed_changes (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                relative_path TEXT NOT NULL,
                original_sha256 TEXT NOT NULL,
                proposed_content TEXT NOT NULL,
                unified_diff TEXT NOT NULL,
                status TEXT NOT NULL,
                approval_id TEXT REFERENCES approvals(id),
                created_at TEXT NOT NULL,
                applied_at TEXT,
                backup_path TEXT
            );
            CREATE TABLE IF NOT EXISTS workspace_policies (
                workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
                max_file_bytes INTEGER NOT NULL,
                max_total_bytes INTEGER NOT NULL,
                allow_new_files INTEGER NOT NULL,
                proposal_lifetime_hours INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workspace_access (
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                principal TEXT NOT NULL,
                role TEXT NOT NULL,
                granted_at TEXT NOT NULL,
                PRIMARY KEY(workspace_id, principal)
            );
            CREATE TABLE IF NOT EXISTS backup_verifications (
                id TEXT PRIMARY KEY,
                backup_path TEXT NOT NULL,
                checksum_match INTEGER NOT NULL,
                integrity_result TEXT NOT NULL,
                valid INTEGER NOT NULL,
                verified_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS principals (
                name TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                active INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS approval_votes (
                approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
                principal TEXT NOT NULL,
                decision TEXT NOT NULL,
                note TEXT NOT NULL,
                voted_at TEXT NOT NULL,
                PRIMARY KEY(approval_id, principal)
            );
            CREATE TABLE IF NOT EXISTS secret_vault (
                name TEXT PRIMARY KEY,
                encrypted_blob BLOB NOT NULL,
                owner TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS forge_artifacts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                kind TEXT NOT NULL,
                content TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                provenance_json TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS forge_artifact_sources (
                artifact_id TEXT NOT NULL REFERENCES forge_artifacts(id) ON DELETE CASCADE,
                source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                PRIMARY KEY(artifact_id, source_id)
            );
            CREATE TABLE IF NOT EXISTS execution_runs (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                runner TEXT NOT NULL,
                status TEXT NOT NULL,
                approval_id TEXT NOT NULL REFERENCES approvals(id),
                command_json TEXT NOT NULL,
                requested_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                exit_code INTEGER,
                stdout TEXT,
                stderr TEXT
            );
            CREATE TABLE IF NOT EXISTS academy_answers (
                id TEXT PRIMARY KEY,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                citations_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workspace_runner_policies (
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                runner TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(workspace_id, runner)
            );
            CREATE TABLE IF NOT EXISTS academy_lessons (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                topic TEXT NOT NULL,
                content TEXT NOT NULL,
                citations_json TEXT NOT NULL,
                content_sha256 TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS forge_bundles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                template TEXT NOT NULL,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS forge_bundle_items (
                bundle_id TEXT NOT NULL REFERENCES forge_bundles(id) ON DELETE CASCADE,
                artifact_id TEXT NOT NULL REFERENCES forge_artifacts(id),
                change_id TEXT NOT NULL REFERENCES proposed_changes(id),
                relative_path TEXT NOT NULL,
                PRIMARY KEY(bundle_id, relative_path)
            );
            CREATE TABLE IF NOT EXISTS forge_artifact_relations (
                parent_artifact_id TEXT NOT NULL REFERENCES forge_artifacts(id) ON DELETE CASCADE,
                child_artifact_id TEXT NOT NULL REFERENCES forge_artifacts(id) ON DELETE CASCADE,
                relation TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(parent_artifact_id, child_artifact_id, relation)
            );
            CREATE TABLE IF NOT EXISTS academy_assessments (
                id TEXT PRIMARY KEY,
                lesson_id TEXT NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                questions_json TEXT NOT NULL,
                rubric_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS academy_submissions (
                id TEXT PRIMARY KEY,
                assessment_id TEXT NOT NULL REFERENCES academy_assessments(id) ON DELETE CASCADE,
                principal TEXT NOT NULL,
                answers_json TEXT NOT NULL,
                status TEXT NOT NULL,
                submitted_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS laboratory_items (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                kind TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL,
                confidence REAL NOT NULL,
                provenance TEXT NOT NULL,
                assumptions_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS laboratory_evidence (
                item_id TEXT NOT NULL REFERENCES laboratory_items(id) ON DELETE CASCADE,
                source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                relationship TEXT NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(item_id, source_id, relationship)
            );
            """
        )
        self._ensure_column("approvals", "expires_at", "TEXT")
        self._ensure_column("approvals", "required_votes", "INTEGER NOT NULL DEFAULT 1")
        self._ensure_column("forge_artifacts", "approval_id", "TEXT")
        self._ensure_column("forge_artifacts", "release_signature", "TEXT")
        self._ensure_column("forge_artifacts", "released_at", "TEXT")
        self._ensure_column("execution_runs", "result_sha256", "TEXT")
        self._ensure_column("execution_runs", "result_signature", "TEXT")
        self._ensure_column("proposed_changes", "expires_at", "TEXT")
        self._ensure_column("proposed_changes", "rejection_reason", "TEXT")
        self._ensure_column("proposed_changes", "post_apply_sha256", "TEXT")
        self._ensure_column("proposed_changes", "rollback_approval_id", "TEXT")
        self._ensure_column("proposed_changes", "rolled_back_at", "TEXT")
        self.connection.execute(
            """
            INSERT OR IGNORE INTO workspace_policies(
                workspace_id, max_file_bytes, max_total_bytes,
                allow_new_files, proposal_lifetime_hours, updated_at
            )
            SELECT id, 500000, 20000000, 0, 168, ? FROM workspaces
            """,
            (utc_now(),),
        )
        self.connection.execute(
            """
            INSERT OR IGNORE INTO workspace_runner_policies(
                workspace_id, runner, enabled, updated_at
            )
            SELECT id, 'python_compile', 1, ? FROM workspaces
            """,
            (utc_now(),),
        )
        self.connection.execute(
            """
            INSERT OR IGNORE INTO workspace_runner_policies(
                workspace_id, runner, enabled, updated_at
            )
            SELECT id, 'python_unittest', 0, ? FROM workspaces
            """,
            (utc_now(),),
        )
        self.connection.execute(
            """
            INSERT OR IGNORE INTO workspace_access(
                workspace_id, principal, role, granted_at
            )
            SELECT id, 'creator', 'maintainer', ? FROM workspaces
            """,
            (utc_now(),),
        )
        try:
            self.connection.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS search_index
                USING fts5(kind UNINDEXED, record_id UNINDEXED, title, body)
                """
            )
            self.fts_enabled = True
        except sqlite3.OperationalError:
            self.fts_enabled = False
        self.connection.commit()
        if self.fts_enabled:
            self.rebuild_search_index()

    def _ensure_column(self, table: str, column: str, declaration: str) -> None:
        columns = {
            row["name"]
            for row in self.connection.execute(f"PRAGMA table_info({table})")
        }
        if column not in columns:
            self.connection.execute(
                f"ALTER TABLE {table} ADD COLUMN {column} {declaration}"
            )

    def set_metadata(self, key: str, value: str) -> None:
        self.connection.execute(
            """
            INSERT INTO metadata(key, value) VALUES(?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value),
        )
        self.connection.commit()

    def get_metadata(self, key: str) -> str | None:
        row = self.connection.execute(
            "SELECT value FROM metadata WHERE key = ?", (key,)
        ).fetchone()
        return None if row is None else str(row["value"])

    def add_memory(
        self,
        title: str,
        content: str,
        *,
        owner: str = "creator",
        provenance: str = "user_supplied",
        sensitivity: str = "private",
        retention: str = "until_deleted",
    ) -> str:
        memory_id = str(uuid.uuid4())
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO memories(
                id, title, content, owner, provenance, sensitivity,
                retention, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                memory_id,
                title,
                content,
                owner,
                provenance,
                sensitivity,
                retention,
                now,
                now,
            ),
        )
        self.connection.commit()
        self._index_record("memory", memory_id, title, content)
        return memory_id

    def search_memories(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        pattern = f"%{query.lower()}%"
        rows = self.connection.execute(
            """
            SELECT * FROM memories
            WHERE lower(title) LIKE ? OR lower(content) LIKE ?
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (pattern, pattern, limit),
        ).fetchall()
        results = [dict(row) for row in rows]
        if results:
            return results
        tokens = [
            token.lower()
            for token in re.findall(r"[\w-]+", query, flags=re.UNICODE)
            if len(token) > 2
        ][:8]
        if not tokens:
            return []
        clauses = " OR ".join(
            "(lower(title) LIKE ? OR lower(content) LIKE ?)" for _ in tokens
        )
        parameters: list[Any] = []
        for token in tokens:
            parameters.extend((f"%{token}%", f"%{token}%"))
        parameters.append(limit)
        rows = self.connection.execute(
            f"""
            SELECT * FROM memories
            WHERE {clauses}
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            parameters,
        ).fetchall()
        return [dict(row) for row in rows]

    def get_memory(self, memory_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM memories WHERE id = ?", (memory_id,)
        ).fetchone()
        return None if row is None else dict(row)

    def update_memory(
        self,
        memory_id: str,
        *,
        title: str,
        content: str,
        sensitivity: str,
        retention: str,
    ) -> bool:
        cursor = self.connection.execute(
            """
            UPDATE memories
            SET title = ?, content = ?, sensitivity = ?, retention = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                title.strip(),
                content.strip(),
                sensitivity,
                retention,
                utc_now(),
                memory_id,
            ),
        )
        self.connection.commit()
        if cursor.rowcount > 0:
            self._index_record("memory", memory_id, title, content)
        return cursor.rowcount > 0

    def list_memories(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]

    def delete_memory(self, memory_id: str) -> bool:
        cursor = self.connection.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        self.connection.commit()
        if cursor.rowcount > 0:
            self._remove_index_record("memory", memory_id)
        return cursor.rowcount > 0

    def add_laboratory_item(
        self,
        title: str,
        kind: str,
        content: str,
        *,
        status: str,
        confidence: float,
        provenance: str,
        assumptions: list[str],
    ) -> str:
        item_id = str(uuid.uuid4())
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO laboratory_items(
                id, title, kind, content, status, confidence, provenance,
                assumptions_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                title.strip(),
                kind,
                content.strip(),
                status,
                confidence,
                provenance.strip(),
                json.dumps(assumptions),
                now,
                now,
            ),
        )
        self.connection.commit()
        self._index_record("laboratory", item_id, title, content)
        return item_id

    def get_laboratory_item(self, item_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM laboratory_items WHERE id = ?", (item_id,)
        ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["assumptions"] = json.loads(result.pop("assumptions_json"))
        result["evidence"] = self.list_laboratory_evidence(item_id)
        return result

    def list_laboratory_items(
        self,
        *,
        kind: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        parameters: list[Any] = []
        if kind:
            clauses.append("kind = ?")
            parameters.append(kind)
        if status:
            clauses.append("status = ?")
            parameters.append(status)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        parameters.append(limit)
        rows = self.connection.execute(
            f"""
            SELECT * FROM laboratory_items
            {where}
            ORDER BY updated_at DESC LIMIT ?
            """,
            parameters,
        ).fetchall()
        results = []
        for row in rows:
            result = dict(row)
            result["assumptions"] = json.loads(result.pop("assumptions_json"))
            results.append(result)
        return results

    def add_laboratory_evidence(
        self,
        item_id: str,
        source_id: str,
        relationship: str,
        note: str,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO laboratory_evidence(
                item_id, source_id, relationship, note, created_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (item_id, source_id, relationship, note.strip(), utc_now()),
        )
        self.connection.commit()

    def list_laboratory_evidence(self, item_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT e.*, s.title AS source_title, s.sha256 AS source_sha256
            FROM laboratory_evidence e
            JOIN sources s ON s.id = e.source_id
            WHERE e.item_id = ?
            ORDER BY e.created_at
            """,
            (item_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def append_audit(
        self,
        *,
        actor: str,
        action: str,
        target: str,
        result: str,
        details: dict[str, Any] | None = None,
    ) -> str:
        previous_row = self.connection.execute(
            "SELECT event_hash FROM audit_events ORDER BY sequence DESC LIMIT 1"
        ).fetchone()
        previous_hash = "GENESIS" if previous_row is None else previous_row["event_hash"]
        event_id = str(uuid.uuid4())
        occurred_at = utc_now()
        details_json = json.dumps(details or {}, sort_keys=True, separators=(",", ":"))
        canonical = "|".join(
            [
                event_id,
                occurred_at,
                actor,
                action,
                target,
                result,
                details_json,
                previous_hash,
            ]
        )
        event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        self.connection.execute(
            """
            INSERT INTO audit_events(
                event_id, occurred_at, actor, action, target, result,
                details_json, previous_hash, event_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                occurred_at,
                actor,
                action,
                target,
                result,
                details_json,
                previous_hash,
                event_hash,
            ),
        )
        self.connection.commit()
        return event_id

    def recent_audit(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM audit_events ORDER BY sequence DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]

    def verify_audit_chain(self) -> tuple[bool, str]:
        rows = self.connection.execute(
            "SELECT * FROM audit_events ORDER BY sequence ASC"
        ).fetchall()
        expected_previous = "GENESIS"
        for row in rows:
            if row["previous_hash"] != expected_previous:
                return False, f"Sequence {row['sequence']} has a broken previous hash."
            canonical = "|".join(
                [
                    row["event_id"],
                    row["occurred_at"],
                    row["actor"],
                    row["action"],
                    row["target"],
                    row["result"],
                    row["details_json"],
                    row["previous_hash"],
                ]
            )
            calculated = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            if calculated != row["event_hash"]:
                return False, f"Sequence {row['sequence']} failed hash verification."
            expected_previous = row["event_hash"]
        return True, f"Verified {len(rows)} audit event(s)."

    def export_snapshot(self) -> dict[str, Any]:
        metadata = {
            row["key"]: row["value"]
            for row in self.connection.execute("SELECT key, value FROM metadata")
            if row["key"] not in {"proposal_hmac_key", "release_hmac_key"}
        }
        return {
            "format": "project-blue-snapshot",
            "version": 1,
            "exported_at": utc_now(),
            "metadata": metadata,
            "memories": self.list_memories(limit=1_000_000),
            "projects": self.list_projects(),
            "tasks": self.list_tasks(),
            "approvals": self.list_approvals(limit=1_000_000),
            "conversation_messages": self.conversation_history(limit=1_000_000)[::-1],
            "sources": self.list_sources(),
            "citations": self.list_citations(),
            "conversations": self.list_conversations(),
            "execution_receipts": self.list_execution_receipts(limit=1_000_000),
            "backup_verifications": self.list_backup_verifications(limit=1_000_000),
            "forge_artifacts": self.list_forge_artifacts(limit=1_000_000),
            "execution_runs": self.list_execution_runs(limit=1_000_000),
            "academy_answers": self.list_academy_answers(limit=1_000_000),
            "academy_lessons": self.list_academy_lessons(limit=1_000_000),
            "laboratory_items": self.list_laboratory_items(limit=1_000_000),
            "workspaces": self.list_workspaces(),
            "proposed_changes": self.list_proposed_changes(limit=1_000_000),
            "audit": self.recent_audit(limit=1_000_000)[::-1],
        }

    def create_project(self, name: str, description: str = "") -> str:
        project_id = str(uuid.uuid4())
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO projects(id, name, description, status, created_at, updated_at)
            VALUES (?, ?, ?, 'active', ?, ?)
            """,
            (project_id, name.strip(), description.strip(), now, now),
        )
        self.connection.commit()
        self._index_record("project", project_id, name, description)
        return project_id

    def list_projects(self, status: str | None = None) -> list[dict[str, Any]]:
        if status:
            rows = self.connection.execute(
                "SELECT * FROM projects WHERE status = ? ORDER BY updated_at DESC",
                (status,),
            ).fetchall()
        else:
            rows = self.connection.execute(
                "SELECT * FROM projects ORDER BY updated_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def get_project(self, identifier: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM projects WHERE id = ? OR lower(name) = lower(?)",
            (identifier, identifier),
        ).fetchone()
        return None if row is None else dict(row)

    def create_task(
        self,
        project_id: str,
        title: str,
        details: str = "",
        priority: str = "normal",
    ) -> str:
        task_id = str(uuid.uuid4())
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO tasks(
                id, project_id, title, details, status, priority,
                created_at, updated_at, completed_at
            ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, NULL)
            """,
            (task_id, project_id, title.strip(), details.strip(), priority, now, now),
        )
        self.connection.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id)
        )
        self.connection.commit()
        self._index_record("task", task_id, title, details)
        return task_id

    def list_tasks(
        self, project_id: str | None = None, status: str | None = None
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[str] = []
        if project_id:
            clauses.append("project_id = ?")
            params.append(project_id)
        if status:
            clauses.append("status = ?")
            params.append(status)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self.connection.execute(
            f"SELECT * FROM tasks{where} ORDER BY updated_at DESC", params
        ).fetchall()
        return [dict(row) for row in rows]

    def complete_task(self, task_id: str) -> bool:
        now = utc_now()
        cursor = self.connection.execute(
            """
            UPDATE tasks
            SET status = 'completed', updated_at = ?, completed_at = ?
            WHERE id = ? AND status != 'completed'
            """,
            (now, now, task_id),
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def request_approval(
        self,
        action_type: str,
        summary: str,
        payload: dict[str, Any] | None = None,
        lifetime_hours: int = 24,
        required_votes: int = 1,
    ) -> str:
        approval_id = str(uuid.uuid4())
        expires_at = (datetime.now(UTC) + timedelta(hours=lifetime_hours)).isoformat()
        self.connection.execute(
            """
            INSERT INTO approvals(
                id, action_type, summary, payload_json, status, requested_at,
                expires_at, required_votes
            ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
            """,
            (
                approval_id,
                action_type,
                summary,
                json.dumps(payload or {}, sort_keys=True),
                utc_now(),
                expires_at,
                required_votes,
            ),
        )
        self.connection.commit()
        return approval_id

    def list_approvals(
        self, status: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        self.expire_approvals()
        if status:
            rows = self.connection.execute(
                """
                SELECT * FROM approvals WHERE status = ?
                ORDER BY requested_at DESC LIMIT ?
                """,
                (status, limit),
            ).fetchall()
        else:
            rows = self.connection.execute(
                "SELECT * FROM approvals ORDER BY requested_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_approval(self, approval_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM approvals WHERE id = ?", (approval_id,)
        ).fetchone()
        return None if row is None else dict(row)

    def decide_approval(
        self, approval_id: str, decision: str, actor: str, note: str = ""
    ) -> bool:
        return self.cast_approval_vote(
            approval_id, actor, decision, note
        )

    def cast_approval_vote(
        self,
        approval_id: str,
        principal: str,
        decision: str,
        note: str = "",
    ) -> bool:
        if decision not in {"approved", "denied"}:
            raise ValueError("Decision must be 'approved' or 'denied'.")
        self.expire_approvals()
        approval = self.get_approval(approval_id)
        if approval is None or approval["status"] != "pending":
            return False
        try:
            self.connection.execute(
                """
                INSERT INTO approval_votes(
                    approval_id, principal, decision, note, voted_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (approval_id, principal, decision, note, utc_now()),
            )
        except sqlite3.IntegrityError:
            return False
        if decision == "denied":
            self.connection.execute(
                """
                UPDATE approvals
                SET status = 'denied', decided_at = ?, decided_by = ?,
                    decision_note = ?
                WHERE id = ?
                """,
                (utc_now(), principal, note, approval_id),
            )
        else:
            approvals = self.connection.execute(
                """
                SELECT COUNT(*) FROM approval_votes
                WHERE approval_id = ? AND decision = 'approved'
                """,
                (approval_id,),
            ).fetchone()[0]
            if approvals >= approval["required_votes"]:
                self.connection.execute(
                    """
                    UPDATE approvals
                    SET status = 'approved', decided_at = ?,
                        decided_by = 'quorum', decision_note = ?
                    WHERE id = ?
                    """,
                    (utc_now(), f"{approvals} approval vote(s)", approval_id),
                )
        self.connection.commit()
        return True

    def list_approval_votes(self, approval_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT * FROM approval_votes
            WHERE approval_id = ? ORDER BY voted_at
            """,
            (approval_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def expire_approvals(self) -> int:
        cursor = self.connection.execute(
            """
            UPDATE approvals SET status = 'expired'
            WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?
            """,
            (utc_now(),),
        )
        self.connection.commit()
        return cursor.rowcount

    def add_conversation_message(
        self, role: str, content: str, provider: str
    ) -> str:
        message_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO conversation_messages(id, role, content, provider, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (message_id, role, content, provider, utc_now()),
        )
        self.connection.commit()
        return message_id

    def conversation_history(self, limit: int = 50) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT * FROM conversation_messages
            ORDER BY created_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def clear_conversation_history(self) -> int:
        cursor = self.connection.execute("DELETE FROM conversation_messages")
        self.connection.commit()
        return cursor.rowcount

    def add_source(
        self,
        *,
        title: str,
        original_path: str,
        media_type: str,
        sha256: str,
        content: str,
    ) -> str:
        source_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO sources(
                id, title, original_path, media_type, sha256, content, added_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source_id,
                title.strip(),
                original_path,
                media_type,
                sha256,
                content,
                utc_now(),
            ),
        )
        self.connection.commit()
        self._index_record("source", source_id, title, content)
        return source_id

    def list_sources(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM sources ORDER BY added_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]

    def get_source(self, source_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM sources WHERE id = ?", (source_id,)
        ).fetchone()
        return None if row is None else dict(row)

    def delete_source(self, source_id: str) -> bool:
        cursor = self.connection.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        self.connection.commit()
        if cursor.rowcount > 0:
            self._remove_index_record("source", source_id)
        return cursor.rowcount > 0

    def add_citation(
        self, memory_id: str, source_id: str, locator: str = "", note: str = ""
    ) -> str:
        citation_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO citations(
                id, memory_id, source_id, locator, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (citation_id, memory_id, source_id, locator, note, utc_now()),
        )
        self.connection.commit()
        return citation_id

    def list_citations(
        self, memory_id: str | None = None
    ) -> list[dict[str, Any]]:
        if memory_id:
            rows = self.connection.execute(
                """
                SELECT c.*, s.title AS source_title
                FROM citations c JOIN sources s ON s.id = c.source_id
                WHERE c.memory_id = ? ORDER BY c.created_at DESC
                """,
                (memory_id,),
            ).fetchall()
        else:
            rows = self.connection.execute(
                """
                SELECT c.*, s.title AS source_title
                FROM citations c JOIN sources s ON s.id = c.source_id
                ORDER BY c.created_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def create_conversation(self, title: str) -> str:
        conversation_id = str(uuid.uuid4())
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO conversations(id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (conversation_id, title.strip(), now, now),
        )
        self.connection.commit()
        return conversation_id

    def list_conversations(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM conversations ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]

    def get_conversation(self, identifier: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM conversations WHERE id = ? OR lower(title) = lower(?)",
            (identifier, identifier),
        ).fetchone()
        return None if row is None else dict(row)

    def add_conversation_entry(
        self, conversation_id: str, role: str, content: str, provider: str
    ) -> str:
        entry_id = str(uuid.uuid4())
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO conversation_entries(
                id, conversation_id, role, content, provider, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (entry_id, conversation_id, role, content, provider, now),
        )
        self.connection.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (now, conversation_id),
        )
        self.connection.commit()
        return entry_id

    def conversation_entries(
        self, conversation_id: str, limit: int = 100
    ) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT * FROM conversation_entries
            WHERE conversation_id = ?
            ORDER BY created_at ASC LIMIT ?
            """,
            (conversation_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]

    def add_execution_receipt(
        self, approval_id: str, executor: str, outcome: str, details: str
    ) -> str:
        receipt_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO execution_receipts(
                id, approval_id, executor, outcome, details, occurred_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (receipt_id, approval_id, executor, outcome, details, utc_now()),
        )
        self.connection.commit()
        return receipt_id

    def list_execution_receipts(
        self, approval_id: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        if approval_id:
            rows = self.connection.execute(
                """
                SELECT * FROM execution_receipts WHERE approval_id = ?
                ORDER BY occurred_at DESC LIMIT ?
                """,
                (approval_id, limit),
            ).fetchall()
        else:
            rows = self.connection.execute(
                "SELECT * FROM execution_receipts ORDER BY occurred_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def register_workspace(self, name: str, root_path: str) -> str:
        workspace_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO workspaces(id, name, root_path, mode, created_at)
            VALUES (?, ?, ?, 'read_only', ?)
            """,
            (workspace_id, name.strip(), root_path, utc_now()),
        )
        self.connection.execute(
            """
            INSERT INTO workspace_policies(
                workspace_id, max_file_bytes, max_total_bytes,
                allow_new_files, proposal_lifetime_hours, updated_at
            ) VALUES (?, 500000, 20000000, 0, 168, ?)
            """,
            (workspace_id, utc_now()),
        )
        self.connection.execute(
            """
            INSERT INTO workspace_runner_policies(
                workspace_id, runner, enabled, updated_at
            ) VALUES (?, 'python_compile', 1, ?)
            """,
            (workspace_id, utc_now()),
        )
        self.connection.execute(
            """
            INSERT INTO workspace_runner_policies(
                workspace_id, runner, enabled, updated_at
            ) VALUES (?, 'python_unittest', 0, ?)
            """,
            (workspace_id, utc_now()),
        )
        self.connection.execute(
            """
            INSERT INTO workspace_access(
                workspace_id, principal, role, granted_at
            ) VALUES (?, 'creator', 'maintainer', ?)
            """,
            (workspace_id, utc_now()),
        )
        self.connection.commit()
        return workspace_id

    def list_workspaces(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM workspaces ORDER BY created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]

    def get_workspace(self, identifier: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM workspaces WHERE id = ? OR lower(name) = lower(?)",
            (identifier, identifier),
        ).fetchone()
        return None if row is None else dict(row)

    def get_workspace_policy(self, workspace_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM workspace_policies WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()
        return None if row is None else dict(row)

    def update_workspace_policy(
        self,
        workspace_id: str,
        *,
        max_file_bytes: int,
        max_total_bytes: int,
        allow_new_files: bool,
        proposal_lifetime_hours: int,
    ) -> None:
        self.connection.execute(
            """
            UPDATE workspace_policies
            SET max_file_bytes = ?, max_total_bytes = ?, allow_new_files = ?,
                proposal_lifetime_hours = ?, updated_at = ?
            WHERE workspace_id = ?
            """,
            (
                max_file_bytes,
                max_total_bytes,
                int(allow_new_files),
                proposal_lifetime_hours,
                utc_now(),
                workspace_id,
            ),
        )
        self.connection.commit()

    def set_workspace_access(
        self, workspace_id: str, principal: str, role: str
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO workspace_access(workspace_id, principal, role, granted_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(workspace_id, principal)
            DO UPDATE SET role = excluded.role, granted_at = excluded.granted_at
            """,
            (workspace_id, principal, role, utc_now()),
        )
        self.connection.commit()

    def remove_workspace_access(self, workspace_id: str, principal: str) -> bool:
        cursor = self.connection.execute(
            """
            DELETE FROM workspace_access
            WHERE workspace_id = ? AND principal = ? AND principal != 'creator'
            """,
            (workspace_id, principal),
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def get_workspace_access(
        self, workspace_id: str, principal: str
    ) -> dict[str, Any] | None:
        row = self.connection.execute(
            """
            SELECT * FROM workspace_access
            WHERE workspace_id = ? AND principal = ?
            """,
            (workspace_id, principal),
        ).fetchone()
        return None if row is None else dict(row)

    def list_workspace_access(self, workspace_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT * FROM workspace_access
            WHERE workspace_id = ? ORDER BY principal
            """,
            (workspace_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def add_backup_verification(
        self,
        backup_path: str,
        checksum_match: bool,
        integrity_result: str,
        valid: bool,
    ) -> str:
        verification_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO backup_verifications(
                id, backup_path, checksum_match, integrity_result, valid, verified_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                verification_id,
                backup_path,
                int(checksum_match),
                integrity_result,
                int(valid),
                utc_now(),
            ),
        )
        self.connection.commit()
        return verification_id

    def list_backup_verifications(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT * FROM backup_verifications
            ORDER BY verified_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def create_principal(
        self,
        name: str,
        display_name: str,
        password_salt: bytes,
        password_hash: bytes,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO principals(
                name, display_name, password_salt, password_hash, active, created_at
            ) VALUES (?, ?, ?, ?, 1, ?)
            """,
            (name, display_name, password_salt, password_hash, utc_now()),
        )
        self.connection.commit()

    def get_principal(self, name: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM principals WHERE name = ?", (name,)
        ).fetchone()
        return None if row is None else dict(row)

    def list_principals(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT name, display_name, active, created_at
            FROM principals ORDER BY name
            """
        ).fetchall()
        return [dict(row) for row in rows]

    def set_secret(self, name: str, encrypted_blob: bytes, owner: str) -> None:
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO secret_vault(
                name, encrypted_blob, owner, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                encrypted_blob = excluded.encrypted_blob,
                owner = excluded.owner,
                updated_at = excluded.updated_at
            """,
            (name, encrypted_blob, owner, now, now),
        )
        self.connection.commit()

    def get_secret(self, name: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM secret_vault WHERE name = ?", (name,)
        ).fetchone()
        return None if row is None else dict(row)

    def list_secrets(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT name, owner, created_at, updated_at FROM secret_vault ORDER BY name"
        ).fetchall()
        return [dict(row) for row in rows]

    def delete_secret(self, name: str) -> bool:
        cursor = self.connection.execute(
            "DELETE FROM secret_vault WHERE name = ?", (name,)
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def create_forge_artifact(
        self,
        title: str,
        kind: str,
        content: str,
        sha256: str,
        provenance: dict[str, Any],
        source_ids: list[str],
    ) -> str:
        artifact_id = str(uuid.uuid4())
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO forge_artifacts(
                    id, title, kind, content, sha256, provenance_json,
                    status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
                """,
                (
                    artifact_id,
                    title,
                    kind,
                    content,
                    sha256,
                    json.dumps(provenance, sort_keys=True),
                    utc_now(),
                ),
            )
            self.connection.executemany(
                """
                INSERT INTO forge_artifact_sources(artifact_id, source_id)
                VALUES (?, ?)
                """,
                [(artifact_id, source_id) for source_id in source_ids],
            )
        return artifact_id

    def get_forge_artifact(self, artifact_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM forge_artifacts WHERE id = ?", (artifact_id,)
        ).fetchone()
        return None if row is None else dict(row)

    def attach_artifact_approval(
        self, artifact_id: str, approval_id: str
    ) -> bool:
        cursor = self.connection.execute(
            """
            UPDATE forge_artifacts SET status = 'review_pending', approval_id = ?
            WHERE id = ? AND status = 'draft'
            """,
            (approval_id, artifact_id),
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def mark_artifact_released(
        self, artifact_id: str, release_signature: str
    ) -> bool:
        cursor = self.connection.execute(
            """
            UPDATE forge_artifacts
            SET status = 'released', release_signature = ?, released_at = ?
            WHERE id = ? AND status = 'review_pending'
            """,
            (release_signature, utc_now(), artifact_id),
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def list_forge_artifacts(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM forge_artifacts ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def create_execution_run(
        self,
        workspace_id: str,
        runner: str,
        approval_id: str,
        command: list[str],
        requested_by: str,
    ) -> str:
        run_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO execution_runs(
                id, workspace_id, runner, status, approval_id, command_json,
                requested_by, created_at
            ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
            """,
            (
                run_id,
                workspace_id,
                runner,
                approval_id,
                json.dumps(command),
                requested_by,
                utc_now(),
            ),
        )
        self.connection.commit()
        return run_id

    def get_execution_run(self, run_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM execution_runs WHERE id = ?", (run_id,)
        ).fetchone()
        return None if row is None else dict(row)

    def list_execution_runs(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM execution_runs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def start_execution_run(self, run_id: str) -> bool:
        cursor = self.connection.execute(
            """
            UPDATE execution_runs SET status = 'running', started_at = ?
            WHERE id = ? AND status = 'pending'
            """,
            (utc_now(), run_id),
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def finish_execution_run(
        self,
        run_id: str,
        status: str,
        exit_code: int | None,
        stdout: str,
        stderr: str,
        result_sha256: str = "",
        result_signature: str = "",
    ) -> None:
        self.connection.execute(
            """
            UPDATE execution_runs
            SET status = ?, completed_at = ?, exit_code = ?,
                stdout = ?, stderr = ?, result_sha256 = ?, result_signature = ?
            WHERE id = ?
            """,
            (
                status,
                utc_now(),
                exit_code,
                stdout,
                stderr,
                result_sha256,
                result_signature,
                run_id,
            ),
        )
        self.connection.commit()

    def create_academy_answer(
        self, question: str, answer: str, citations: list[dict[str, Any]]
    ) -> str:
        answer_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO academy_answers(
                id, question, answer, citations_json, created_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                answer_id,
                question,
                answer,
                json.dumps(citations, sort_keys=True),
                utc_now(),
            ),
        )
        self.connection.commit()
        return answer_id

    def list_academy_answers(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM academy_answers ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def get_runner_policy(
        self, workspace_id: str, runner: str
    ) -> dict[str, Any] | None:
        row = self.connection.execute(
            """
            SELECT * FROM workspace_runner_policies
            WHERE workspace_id = ? AND runner = ?
            """,
            (workspace_id, runner),
        ).fetchone()
        return None if row is None else dict(row)

    def set_runner_policy(
        self, workspace_id: str, runner: str, enabled: bool
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO workspace_runner_policies(
                workspace_id, runner, enabled, updated_at
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(workspace_id, runner)
            DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
            """,
            (workspace_id, runner, int(enabled), utc_now()),
        )
        self.connection.commit()

    def list_runner_policies(self, workspace_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT * FROM workspace_runner_policies
            WHERE workspace_id = ? ORDER BY runner
            """,
            (workspace_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def create_academy_lesson(
        self,
        title: str,
        topic: str,
        content: str,
        citations: list[dict[str, Any]],
        content_sha256: str,
    ) -> str:
        lesson_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO academy_lessons(
                id, title, topic, content, citations_json,
                content_sha256, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                lesson_id,
                title,
                topic,
                content,
                json.dumps(citations, sort_keys=True),
                content_sha256,
                utc_now(),
            ),
        )
        self.connection.commit()
        return lesson_id

    def list_academy_lessons(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM academy_lessons ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def get_academy_lesson(self, lesson_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM academy_lessons WHERE id = ?", (lesson_id,)
        ).fetchone()
        return None if row is None else dict(row)

    def create_forge_bundle(
        self, name: str, template: str, workspace_id: str
    ) -> str:
        bundle_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO forge_bundles(
                id, name, template, workspace_id, status, created_at
            ) VALUES (?, ?, ?, ?, 'proposed', ?)
            """,
            (bundle_id, name, template, workspace_id, utc_now()),
        )
        self.connection.commit()
        return bundle_id

    def add_forge_bundle_item(
        self,
        bundle_id: str,
        artifact_id: str,
        change_id: str,
        relative_path: str,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO forge_bundle_items(
                bundle_id, artifact_id, change_id, relative_path
            ) VALUES (?, ?, ?, ?)
            """,
            (bundle_id, artifact_id, change_id, relative_path),
        )
        self.connection.commit()

    def list_forge_bundles(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM forge_bundles ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def list_forge_bundle_items(self, bundle_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT * FROM forge_bundle_items
            WHERE bundle_id = ? ORDER BY relative_path
            """,
            (bundle_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def add_artifact_relation(
        self, parent_artifact_id: str, child_artifact_id: str, relation: str
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO forge_artifact_relations(
                parent_artifact_id, child_artifact_id, relation, created_at
            ) VALUES (?, ?, ?, ?)
            """,
            (parent_artifact_id, child_artifact_id, relation, utc_now()),
        )
        self.connection.commit()

    def create_academy_assessment(
        self,
        lesson_id: str,
        title: str,
        questions: list[dict[str, Any]],
        rubric: list[dict[str, Any]],
    ) -> str:
        assessment_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO academy_assessments(
                id, lesson_id, title, questions_json, rubric_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                assessment_id,
                lesson_id,
                title,
                json.dumps(questions, sort_keys=True),
                json.dumps(rubric, sort_keys=True),
                utc_now(),
            ),
        )
        self.connection.commit()
        return assessment_id

    def get_academy_assessment(
        self, assessment_id: str
    ) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM academy_assessments WHERE id = ?",
            (assessment_id,),
        ).fetchone()
        return None if row is None else dict(row)

    def list_academy_assessments(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM academy_assessments ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def create_academy_submission(
        self, assessment_id: str, principal: str, answers: list[str]
    ) -> str:
        submission_id = str(uuid.uuid4())
        self.connection.execute(
            """
            INSERT INTO academy_submissions(
                id, assessment_id, principal, answers_json, status, submitted_at
            ) VALUES (?, ?, ?, ?, 'submitted_for_review', ?)
            """,
            (
                submission_id,
                assessment_id,
                principal,
                json.dumps(answers),
                utc_now(),
            ),
        )
        self.connection.commit()
        return submission_id

    def list_academy_submissions(
        self, assessment_id: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        if assessment_id:
            rows = self.connection.execute(
                """
                SELECT * FROM academy_submissions
                WHERE assessment_id = ?
                ORDER BY submitted_at DESC LIMIT ?
                """,
                (assessment_id, limit),
            ).fetchall()
        else:
            rows = self.connection.execute(
                """
                SELECT * FROM academy_submissions
                ORDER BY submitted_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def replace_workspace_files(
        self, workspace_id: str, records: list[dict[str, Any]]
    ) -> None:
        now = utc_now()
        with self.connection:
            self.connection.execute(
                "DELETE FROM workspace_files WHERE workspace_id = ?",
                (workspace_id,),
            )
            self.connection.executemany(
                """
                INSERT INTO workspace_files(
                    id, workspace_id, relative_path, size, modified_at,
                    sha256, content, indexed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        str(uuid.uuid4()),
                        workspace_id,
                        row["relative_path"],
                        row["size"],
                        row["modified_at"],
                        row["sha256"],
                        row["content"],
                        now,
                    )
                    for row in records
                ],
            )
            self.connection.execute(
                "UPDATE workspaces SET indexed_at = ? WHERE id = ?",
                (now, workspace_id),
            )
        if self.fts_enabled:
            self.rebuild_search_index()

    def list_workspace_files(
        self, workspace_id: str, limit: int = 1000
    ) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT * FROM workspace_files WHERE workspace_id = ?
            ORDER BY relative_path LIMIT ?
            """,
            (workspace_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]

    def create_proposed_change(
        self,
        workspace_id: str,
        relative_path: str,
        original_sha256: str,
        proposed_content: str,
        unified_diff: str,
        approval_id: str,
        lifetime_hours: int = 168,
    ) -> str:
        change_id = str(uuid.uuid4())
        expires_at = (datetime.now(UTC) + timedelta(hours=lifetime_hours)).isoformat()
        self.connection.execute(
            """
            INSERT INTO proposed_changes(
                id, workspace_id, relative_path, original_sha256,
                proposed_content, unified_diff, status, approval_id, created_at,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)
            """,
            (
                change_id,
                workspace_id,
                relative_path,
                original_sha256,
                proposed_content,
                unified_diff,
                approval_id,
                utc_now(),
                expires_at,
            ),
        )
        self.connection.commit()
        return change_id

    def get_proposed_change(self, change_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM proposed_changes WHERE id = ?", (change_id,)
        ).fetchone()
        return None if row is None else dict(row)

    def list_proposed_changes(
        self, status: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        if status:
            rows = self.connection.execute(
                """
                SELECT * FROM proposed_changes WHERE status = ?
                ORDER BY created_at DESC LIMIT ?
                """,
                (status, limit),
            ).fetchall()
        else:
            rows = self.connection.execute(
                "SELECT * FROM proposed_changes ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_change_applied(
        self, change_id: str, backup_path: str, post_apply_sha256: str
    ) -> bool:
        cursor = self.connection.execute(
            """
            UPDATE proposed_changes
            SET status = 'applied', applied_at = ?, backup_path = ?,
                post_apply_sha256 = ?
            WHERE id = ? AND status = 'proposed'
            """,
            (utc_now(), backup_path, post_apply_sha256, change_id),
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def reject_change(self, change_id: str, reason: str) -> bool:
        cursor = self.connection.execute(
            """
            UPDATE proposed_changes
            SET status = 'rejected', rejection_reason = ?
            WHERE id = ? AND status = 'proposed'
            """,
            (reason, change_id),
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def expire_changes(self) -> int:
        cursor = self.connection.execute(
            """
            UPDATE proposed_changes SET status = 'expired'
            WHERE status = 'proposed' AND expires_at IS NOT NULL AND expires_at < ?
            """,
            (utc_now(),),
        )
        self.connection.commit()
        return cursor.rowcount

    def set_rollback_approval(self, change_id: str, approval_id: str) -> bool:
        cursor = self.connection.execute(
            """
            UPDATE proposed_changes SET rollback_approval_id = ?
            WHERE id = ? AND status = 'applied' AND rollback_approval_id IS NULL
            """,
            (approval_id, change_id),
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def mark_change_rolled_back(self, change_id: str) -> bool:
        cursor = self.connection.execute(
            """
            UPDATE proposed_changes
            SET status = 'rolled_back', rolled_back_at = ?
            WHERE id = ? AND status = 'applied'
            """,
            (utc_now(), change_id),
        )
        self.connection.commit()
        return cursor.rowcount > 0

    def _index_record(
        self, kind: str, record_id: str, title: str, body: str
    ) -> None:
        if not self.fts_enabled:
            return
        self.connection.execute(
            "DELETE FROM search_index WHERE kind = ? AND record_id = ?",
            (kind, record_id),
        )
        self.connection.execute(
            """
            INSERT INTO search_index(kind, record_id, title, body)
            VALUES (?, ?, ?, ?)
            """,
            (kind, record_id, title, body),
        )
        self.connection.commit()

    def _remove_index_record(self, kind: str, record_id: str) -> None:
        if not self.fts_enabled:
            return
        self.connection.execute(
            "DELETE FROM search_index WHERE kind = ? AND record_id = ?",
            (kind, record_id),
        )
        self.connection.commit()

    def rebuild_search_index(self) -> None:
        if not self.fts_enabled:
            return
        self.connection.execute("DELETE FROM search_index")
        mappings = (
            ("memory", "SELECT id, title, content AS body FROM memories"),
            ("project", "SELECT id, name AS title, description AS body FROM projects"),
            ("task", "SELECT id, title, details AS body FROM tasks"),
            ("source", "SELECT id, title, content AS body FROM sources"),
            (
                "laboratory",
                "SELECT id, title, content AS body FROM laboratory_items",
            ),
            (
                "file",
                """
                SELECT id, relative_path AS title, content AS body
                FROM workspace_files
                """,
            ),
        )
        for kind, statement in mappings:
            for row in self.connection.execute(statement):
                self.connection.execute(
                    """
                    INSERT INTO search_index(kind, record_id, title, body)
                    VALUES (?, ?, ?, ?)
                    """,
                    (kind, row["id"], row["title"], row["body"]),
                )
        self.connection.commit()

    def unified_search(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        tokens = re.findall(r"[\w-]+", query, flags=re.UNICODE)
        if self.fts_enabled and tokens:
            expression = " AND ".join(f'"{token}"*' for token in tokens)
            try:
                rows = self.connection.execute(
                    """
                    SELECT kind AS type, record_id AS id, title, body
                    FROM search_index WHERE search_index MATCH ?
                    ORDER BY bm25(search_index) LIMIT ?
                    """,
                    (expression, limit),
                ).fetchall()
                results = [dict(row) for row in rows]
                if results:
                    return results
                expression = " OR ".join(f'"{token}"*' for token in tokens)
                rows = self.connection.execute(
                    """
                    SELECT kind AS type, record_id AS id, title, body
                    FROM search_index WHERE search_index MATCH ?
                    ORDER BY bm25(search_index) LIMIT ?
                    """,
                    (expression, limit),
                ).fetchall()
                return [dict(row) for row in rows]
            except sqlite3.OperationalError:
                pass
        pattern = f"%{query.lower()}%"
        per_type = max(1, limit)
        results: list[dict[str, Any]] = []
        for row in self.connection.execute(
            """
            SELECT id, title, content AS body, updated_at
            FROM memories
            WHERE lower(title) LIKE ? OR lower(content) LIKE ?
            ORDER BY updated_at DESC LIMIT ?
            """,
            (pattern, pattern, per_type),
        ):
            results.append({"type": "memory", **dict(row)})
        for row in self.connection.execute(
            """
            SELECT id, name AS title, description AS body, updated_at
            FROM projects
            WHERE lower(name) LIKE ? OR lower(description) LIKE ?
            ORDER BY updated_at DESC LIMIT ?
            """,
            (pattern, pattern, per_type),
        ):
            results.append({"type": "project", **dict(row)})
        for row in self.connection.execute(
            """
            SELECT id, title, details AS body, updated_at
            FROM tasks
            WHERE lower(title) LIKE ? OR lower(details) LIKE ?
            ORDER BY updated_at DESC LIMIT ?
            """,
            (pattern, pattern, per_type),
        ):
            results.append({"type": "task", **dict(row)})
        for row in self.connection.execute(
            """
            SELECT id, title, content AS body, added_at AS updated_at
            FROM sources
            WHERE lower(title) LIKE ? OR lower(content) LIKE ?
            ORDER BY added_at DESC LIMIT ?
            """,
            (pattern, pattern, per_type),
        ):
            results.append({"type": "source", **dict(row)})
        for row in self.connection.execute(
            """
            SELECT id, title, content AS body, updated_at
            FROM laboratory_items
            WHERE lower(title) LIKE ? OR lower(content) LIKE ?
            ORDER BY updated_at DESC LIMIT ?
            """,
            (pattern, pattern, per_type),
        ):
            results.append({"type": "laboratory", **dict(row)})
        for row in self.connection.execute(
            """
            SELECT id, relative_path AS title, content AS body,
                   indexed_at AS updated_at
            FROM workspace_files
            WHERE lower(relative_path) LIKE ? OR lower(content) LIKE ?
            ORDER BY indexed_at DESC LIMIT ?
            """,
            (pattern, pattern, per_type),
        ):
            results.append({"type": "file", **dict(row)})
        results.sort(key=lambda row: row["updated_at"], reverse=True)
        return results[:limit]
