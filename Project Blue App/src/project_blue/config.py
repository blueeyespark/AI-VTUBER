from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class BlueConfig:
    identity_name: str = "Blue"
    provider: str = "offline"
    model: str = "llama3.2"
    openai_model: str = "gpt-5.5"
    ollama_url: str = "http://127.0.0.1:11434"
    prefer_local_provider: bool = True
    local_ram_gb: int = 8
    ollama_context_tokens: int = 4096
    ollama_gpu_layers: int = -1
    memory_result_limit: int = 5
    save_conversations: bool = False


def default_home() -> Path:
    override = os.environ.get("PROJECT_BLUE_HOME")
    if override:
        return Path(override).expanduser().resolve()
    return (Path.cwd() / ".blue").resolve()


def load_config(home: Path) -> BlueConfig:
    path = home / "config.json"
    if not path.exists():
        return BlueConfig()
    payload = json.loads(path.read_text(encoding="utf-8"))
    allowed = BlueConfig.__dataclass_fields__.keys()
    return BlueConfig(**{key: value for key, value in payload.items() if key in allowed})


def save_config(home: Path, config: BlueConfig) -> None:
    home.mkdir(parents=True, exist_ok=True)
    path = home / "config.json"
    path.write_text(json.dumps(asdict(config), indent=2) + "\n", encoding="utf-8")
