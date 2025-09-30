from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from typing import Iterable

from .config import CONFIG


class StorageManager:
    def __init__(self) -> None:
        self.config = CONFIG.storage
        self._ensure_directories()

    def _ensure_directories(self) -> None:
        for directory in (
            self.config.base_dir,
            self.config.uploads_dir,
            self.config.intermediates_dir,
            self.config.outputs_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)

    def prepare_run_directory(self, run_id: int) -> dict[str, Path]:
        run_root = self.config.base_dir / f"run_{run_id:08d}"
        uploads = run_root / "uploads"
        intermediates = run_root / "intermediates"
        outputs = run_root / "outputs"
        for directory in (run_root, uploads, intermediates, outputs):
            directory.mkdir(parents=True, exist_ok=True)
        return {
            "root": run_root,
            "uploads": uploads,
            "intermediates": intermediates,
            "outputs": outputs,
        }

    def save_upload(self, file_bytes: bytes, original_name: str, run_dir: Path) -> Path:
        timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S%f")
        sanitized_name = original_name.replace("/", "_")
        target = run_dir / f"{timestamp}_{sanitized_name}"
        with open(target, "wb") as f:
            f.write(file_bytes)
        return target

    def copy_files(self, files: Iterable[Path], target_dir: Path) -> list[Path]:
        copied: list[Path] = []
        for file_path in files:
            destination = target_dir / file_path.name
            shutil.copy(file_path, destination)
            copied.append(destination)
        return copied


STORAGE = StorageManager()
