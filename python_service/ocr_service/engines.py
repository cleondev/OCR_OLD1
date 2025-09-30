from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pytesseract
from paddleocr import PaddleOCR
from pytesseract import Output

from .config import CONFIG

LOGGER = logging.getLogger(__name__)


@dataclass
class OcrEngineResult:
    text: str
    confidence: Optional[float]
    engine: str
    page_number: Optional[int]
    extra: dict


class TesseractEngine:
    def __init__(self) -> None:
        self.config = CONFIG.tesseract

    def run(self, image_path: Path, page_number: Optional[int] = None) -> OcrEngineResult:
        tess_config = self.config.config or ""
        custom_config = f"--psm {self.config.psm} --oem {self.config.oem} {tess_config}".strip()
        data = pytesseract.image_to_data(
            str(image_path),
            lang=self.config.languages,
            output_type=Output.DICT,
            config=custom_config,
        )
        text = pytesseract.image_to_string(
            str(image_path), lang=self.config.languages, config=custom_config
        )
        confidences = [int(conf) for conf in data.get("conf", []) if conf and conf != "-1"]
        avg_conf = float(np.mean(confidences)) if confidences else None
        return OcrEngineResult(
            text=text,
            confidence=avg_conf,
            engine="tesseract",
            page_number=page_number,
            extra={"word_data": data},
        )


class PaddleEngine:
    def __init__(self) -> None:
        self.config = CONFIG.paddle
        self._ocr: Optional[PaddleOCR] = None

    def _load(self) -> PaddleOCR:
        if self._ocr is None:
            LOGGER.info("Loading PaddleOCR (lang=%s, gpu=%s)", self.config.lang, self.config.use_gpu)
            self._ocr = PaddleOCR(
                use_angle_cls=self.config.use_angle_cls,
                lang=self.config.lang,
                use_gpu=self.config.use_gpu,
                enable_mkldnn=self.config.enable_mkldnn,
                det_model_dir=self.config.det_model_dir,
                rec_model_dir=self.config.rec_model_dir,
                cpu_threads=self.config.cpu_threads,
            )
        return self._ocr

    def run(self, image_path: Path, page_number: Optional[int] = None) -> OcrEngineResult:
        ocr = self._load()
        result = ocr.ocr(str(image_path), det=True, rec=True, cls=True)
        lines = []
        confidences = []
        for line in result:
            for _, (text, conf) in line:
                lines.append(text)
                confidences.append(conf)
        text = "\n".join(lines)
        avg_conf = float(np.mean(confidences)) if confidences else None
        return OcrEngineResult(
            text=text,
            confidence=avg_conf,
            engine="paddleocr",
            page_number=page_number,
            extra={"raw": result},
        )


TESSERACT_ENGINE = TesseractEngine()
PADDLE_ENGINE = PaddleEngine()
