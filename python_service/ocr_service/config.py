from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class TesseractConfig:
    languages: str = os.getenv("OCR_TESS_LANGUAGES", "vie+eng")
    psm: int = int(os.getenv("OCR_TESS_PSM", "6"))
    oem: int = int(os.getenv("OCR_TESS_OEM", "1"))
    config: str = os.getenv("OCR_TESS_CONFIG", "")


@dataclass
class PaddleConfig:
    use_angle_cls: bool = os.getenv("OCR_PADDLE_USE_ANGLE", "true").lower() == "true"
    lang: str = os.getenv("OCR_PADDLE_LANG", "en")
    det_model_dir: Optional[str] = os.getenv("OCR_PADDLE_DET_MODEL")
    rec_model_dir: Optional[str] = os.getenv("OCR_PADDLE_REC_MODEL")
    use_gpu: bool = os.getenv("OCR_PADDLE_USE_GPU", "false").lower() == "true"
    enable_mkldnn: bool = os.getenv("OCR_PADDLE_MKLDNN", "true").lower() == "true"
    cpu_threads: int = int(os.getenv("OCR_PADDLE_CPU_THREADS", "4"))


@dataclass
class StorageConfig:
    base_dir: Path = Path(os.getenv("OCR_STORAGE_ROOT", "python_service_data"))

    @property
    def uploads_dir(self) -> Path:
        return self.base_dir / "uploads"

    @property
    def intermediates_dir(self) -> Path:
        return self.base_dir / "intermediates"

    @property
    def outputs_dir(self) -> Path:
        return self.base_dir / "outputs"


@dataclass
class DatabaseConfig:
    url: str = os.getenv("OCR_DB_URL", "sqlite:///python_service_data/ocr_history.sqlite")


@dataclass
class AppConfig:
    storage: StorageConfig = StorageConfig()
    database: DatabaseConfig = DatabaseConfig()
    tesseract: TesseractConfig = TesseractConfig()
    paddle: PaddleConfig = PaddleConfig()
    allowed_file_size_mb: int = int(os.getenv("OCR_MAX_FILE_MB", "25"))


CONFIG = AppConfig()
