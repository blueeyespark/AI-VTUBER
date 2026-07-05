from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1"

DOMAINS: dict[str, dict[str, Any]] = {
    "automation": {
        "name": "PC Action Proposals",
        "risk": "high",
        "kinds": ["action_proposal", "workflow_plan", "permission_profile"],
        "boundary": "Records proposals only; it cannot execute desktop actions.",
    },
    "network": {
        "name": "Trusted Host Network",
        "risk": "critical",
        "kinds": ["host_candidate", "trust_policy", "sync_plan", "revocation_plan"],
        "boundary": "No connection, remote control, credential, or synchronization is performed.",
    },
    "mobile": {
        "name": "Mobile Companion",
        "risk": "critical",
        "kinds": ["invitation_plan", "notification_plan", "approval_flow"],
        "boundary": "No public endpoint, pairing token, or remote command channel is created.",
    },
    "community": {
        "name": "Community and Social",
        "risk": "high",
        "kinds": ["content_draft", "moderation_case", "community_rule", "event_plan"],
        "boundary": "Content remains local and is never posted or sent.",
    },
    "enterprise": {
        "name": "Enterprise",
        "risk": "medium",
        "kinds": ["team", "calendar_event", "inventory_item", "operation_plan"],
        "boundary": "Local records only; no account invitations or external calendar changes.",
    },
    "finance": {
        "name": "Finance",
        "risk": "critical",
        "kinds": ["budget", "account_record", "reconciliation_note", "treasury_policy"],
        "boundary": "Record keeping only; no transaction, trade, transfer, or financial advice execution.",
    },
    "medical": {
        "name": "Medical Education",
        "risk": "critical",
        "kinds": ["education_note", "source_summary", "care_question", "emergency_plan"],
        "boundary": "Educational organization only; no diagnosis, treatment, or emergency substitution.",
    },
    "robotics": {
        "name": "Robotics Simulation",
        "risk": "critical",
        "kinds": ["simulation_plan", "telemetry_sample", "safety_case", "emergency_stop_plan"],
        "boundary": "Simulation records only; no hardware command or actuator access.",
    },
    "explorer": {
        "name": "Peaceful Exploration",
        "risk": "critical",
        "kinds": ["mission_simulation", "science_goal", "environment_model", "risk_assessment"],
        "boundary": "Planning and simulation only; no physical mission execution.",
    },
    "continuity": {
        "name": "Seed, Ark, and Migration",
        "risk": "high",
        "kinds": ["seed_manifest", "migration_plan", "succession_record", "hibernation_plan"],
        "boundary": "Stores plans and manifests; no unattended migration or secret export.",
    },
    "world_model": {
        "name": "World Model",
        "risk": "high",
        "kinds": ["entity", "event", "relation", "claim"],
        "boundary": "Provenance-tagged local claims only; records are not treated as ground truth.",
    },
    "research": {
        "name": "Internet Research Queue",
        "risk": "medium",
        "kinds": ["research_question", "source_candidate", "claim_review", "contradiction"],
        "boundary": "Queues research and sources; it does not browse or accept claims automatically.",
    },
}

SECRET_PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----", re.I),
    re.compile(r"\b(?:api[_ -]?key|password|passwd|access[_ -]?token)\s*[:=]\s*\S+", re.I),
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


class ExpansionStore:
    def __init__(self, database: Path):
        self.database = database.resolve()
        self.database.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.database)
        self.connection.row_factory = sqlite3.Row
        self.initialize()

    def initialize(self) -> None:
        self.connection.executescript(
            """
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY,
                domain TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                source TEXT NOT NULL,
                risk TEXT NOT NULL,
                status TEXT NOT NULL,
                approval_required INTEGER NOT NULL,
                execution_enabled INTEGER NOT NULL,
                boundary TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_expansion_domain
                ON records(domain, updated_at DESC);
            CREATE TABLE IF NOT EXISTS audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                details_json TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                event_hash TEXT NOT NULL
            );
            """
        )
        self.connection.execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES('schema_version', ?)",
            (SCHEMA_VERSION,),
        )
        self.connection.commit()

    def append_audit(self, action: str, target: str, details: dict[str, Any]) -> None:
        prior = self.connection.execute(
            "SELECT event_hash FROM audit ORDER BY id DESC LIMIT 1"
        ).fetchone()
        previous_hash = prior["event_hash"] if prior else "GENESIS"
        timestamp = utc_now()
        details_json = canonical(details)
        event_hash = hashlib.sha256(
            f"{previous_hash}|{timestamp}|{action}|{target}|{details_json}".encode()
        ).hexdigest()
        self.connection.execute(
            """
            INSERT INTO audit(
                timestamp, action, target, details_json, previous_hash, event_hash
            ) VALUES(?, ?, ?, ?, ?, ?)
            """,
            (timestamp, action, target, details_json, previous_hash, event_hash),
        )

    def create(
        self, domain: str, kind: str, title: str, content: str, source: str
    ) -> dict[str, Any]:
        if domain not in DOMAINS:
            raise ValueError("Unknown expansion domain.")
        profile = DOMAINS[domain]
        if kind not in profile["kinds"]:
            raise ValueError(f"{kind!r} is not allowed in the {domain} foundation.")
        title = " ".join(title.split()).strip()
        content = content.strip()
        source = source.strip()
        if not title or len(title) > 200:
            raise ValueError("Title must contain 1 to 200 characters.")
        if not content or len(content) > 20_000:
            raise ValueError("Content must contain 1 to 20,000 characters.")
        if len(source) > 2_000:
            raise ValueError("Source is limited to 2,000 characters.")
        combined = f"{title}\n{content}\n{source}"
        if any(pattern.search(combined) for pattern in SECRET_PATTERNS):
            raise ValueError("Secret-looking values cannot be stored in expansion records.")
        if domain == "medical":
            content += (
                "\n\nBoundary: Educational information only. This record is not a "
                "diagnosis, treatment plan, or replacement for a clinician or emergency service."
            )
        record_id = str(uuid.uuid4())
        timestamp = utc_now()
        approval_required = profile["risk"] in {"high", "critical"}
        self.connection.execute(
            """
            INSERT INTO records(
                id, domain, kind, title, content, source, risk, status,
                approval_required, execution_enabled, boundary, created_at, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, 'foundation_record', ?, 0, ?, ?, ?)
            """,
            (
                record_id,
                domain,
                kind,
                title,
                content,
                source,
                profile["risk"],
                int(approval_required),
                profile["boundary"],
                timestamp,
                timestamp,
            ),
        )
        self.append_audit(
            "expansion.create",
            record_id,
            {
                "domain": domain,
                "kind": kind,
                "approval_required": approval_required,
                "execution_enabled": False,
            },
        )
        self.connection.commit()
        return self.get(record_id)

    def get(self, record_id: str) -> dict[str, Any]:
        row = self.connection.execute(
            "SELECT * FROM records WHERE id = ?", (record_id,)
        ).fetchone()
        if row is None:
            raise ValueError("Expansion record not found.")
        result = dict(row)
        result["approval_required"] = bool(result["approval_required"])
        result["execution_enabled"] = bool(result["execution_enabled"])
        return result

    def list(self, domain: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        limit = min(max(int(limit), 1), 200)
        if domain:
            if domain not in DOMAINS:
                raise ValueError("Unknown expansion domain.")
            rows = self.connection.execute(
                "SELECT * FROM records WHERE domain = ? ORDER BY updated_at DESC LIMIT ?",
                (domain, limit),
            ).fetchall()
        else:
            rows = self.connection.execute(
                "SELECT * FROM records ORDER BY updated_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [
            {
                **dict(row),
                "approval_required": bool(row["approval_required"]),
                "execution_enabled": bool(row["execution_enabled"]),
            }
            for row in rows
        ]

    def status(self) -> dict[str, Any]:
        counts = {
            row["domain"]: row["count"]
            for row in self.connection.execute(
                "SELECT domain, COUNT(*) AS count FROM records GROUP BY domain"
            )
        }
        return {
            "schema": "project-blue-safe-expansion-v1",
            "schema_version": SCHEMA_VERSION,
            "database": str(self.database),
            "domains": [
                {
                    "id": domain,
                    **profile,
                    "record_count": counts.get(domain, 0),
                    "execution_enabled": False,
                }
                for domain, profile in DOMAINS.items()
            ],
            "record_count": sum(counts.values()),
            "audit_valid": self.verify_audit()["valid"],
        }

    def verify_audit(self) -> dict[str, Any]:
        previous_hash = "GENESIS"
        count = 0
        for row in self.connection.execute("SELECT * FROM audit ORDER BY id"):
            expected = hashlib.sha256(
                (
                    f"{previous_hash}|{row['timestamp']}|{row['action']}|"
                    f"{row['target']}|{row['details_json']}"
                ).encode()
            ).hexdigest()
            if row["previous_hash"] != previous_hash or row["event_hash"] != expected:
                return {"valid": False, "events": count, "failed_id": row["id"]}
            previous_hash = row["event_hash"]
            count += 1
        return {"valid": True, "events": count}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="blue-expansion")
    result.add_argument("--db", type=Path, required=True)
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("status")
    create = commands.add_parser("create")
    create.add_argument("domain", choices=sorted(DOMAINS))
    create.add_argument("kind")
    create.add_argument("title")
    create.add_argument("content")
    create.add_argument("--source", default="")
    commands.add_parser("create-json")
    listing = commands.add_parser("list")
    listing.add_argument("--domain", choices=sorted(DOMAINS))
    listing.add_argument("--limit", type=int, default=50)
    commands.add_parser("verify")
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        store = ExpansionStore(args.db)
        if args.command == "status":
            value = store.status()
        elif args.command == "create":
            value = store.create(
                args.domain, args.kind, args.title, args.content, args.source
            )
        elif args.command == "create-json":
            raw = sys.stdin.read(65_537)
            if len(raw) > 65_536:
                raise ValueError("Expansion input is limited to 65,536 characters.")
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError("Expansion input must be a JSON object.")
            value = store.create(
                str(payload.get("domain", "")),
                str(payload.get("kind", "")),
                str(payload.get("title", "")),
                str(payload.get("content", "")),
                str(payload.get("source", "")),
            )
        elif args.command == "list":
            value = store.list(args.domain, args.limit)
        else:
            value = store.verify_audit()
        print(json.dumps(value, indent=2, ensure_ascii=False))
        return 0
    except (ValueError, sqlite3.Error) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
