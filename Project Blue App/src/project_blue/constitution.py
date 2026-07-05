from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from importlib.resources import files
from typing import Any


@dataclass(frozen=True)
class Article:
    number: int
    title: str
    text: str


@dataclass(frozen=True)
class Constitution:
    name: str
    version: str
    articles: tuple[Article, ...]
    fingerprint: str

    @classmethod
    def load_embedded(cls) -> "Constitution":
        path = files("project_blue").joinpath("data/constitution.json")
        payload: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        fingerprint = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        articles = tuple(Article(**item) for item in payload["articles"])
        return cls(
            name=payload["name"],
            version=payload["version"],
            articles=articles,
            fingerprint=fingerprint,
        )

    def format_text(self) -> str:
        lines = [f"{self.name} v{self.version}", f"SHA-256: {self.fingerprint}", ""]
        for article in self.articles:
            lines.extend(
                [
                    f"Article {article.number} — {article.title}",
                    article.text,
                    "",
                ]
            )
        return "\n".join(lines).rstrip()
