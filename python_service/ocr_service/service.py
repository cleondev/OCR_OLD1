from __future__ import annotations

import logging
import mimetypes
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from fastapi import HTTPException

from .config import CONFIG
from .database import OcrImage, OcrResult, OcrRun, init_db, session_scope
from .document_processor import DOCUMENT_PROCESSOR
from .engines import OcrEngineResult, PADDLE_ENGINE, TESSERACT_ENGINE
from .storage import STORAGE

LOGGER = logging.getLogger(__name__)

OcrMode = Literal["auto", "fast", "enhanced"]


@dataclass
class ServiceResult:
    run_id: int
    mode: str
    results: list[OcrEngineResult]
    selected_engine: str


class OcrService:
    def __init__(self) -> None:
        init_db()

    def _update_run(self, run_id: int, **kwargs) -> None:
        with session_scope() as session:
            run = session.get(OcrRun, run_id)
            if not run:
                raise RuntimeError(f"Run {run_id} not found")
            for key, value in kwargs.items():
                setattr(run, key, value)
            run.updated_at = datetime.utcnow()

    def _record_images(self, run_id: int, prepared) -> None:
        with session_scope() as session:
            run = session.get(OcrRun, run_id)
            if not run:
                raise RuntimeError(f"Run {run_id} not found")
            original = OcrImage(
                run_id=run_id,
                role="original",
                path=str(prepared.original_path),
                page_number=None,
                step="upload",
            )
            session.add(original)
            for conversion, path in prepared.converted_files:
                image = OcrImage(
                    run_id=run_id,
                    role="converted",
                    path=str(path),
                    page_number=None,
                    step=conversion,
                )
                session.add(image)
            for idx, page in enumerate(prepared.page_images, start=1):
                session.add(
                    OcrImage(
                        run_id=run_id,
                        role="page",
                        path=str(page),
                        page_number=idx,
                        step="page_image",
                    )
                )
            for idx, pre in enumerate(prepared.preprocessed, start=1):
                img = OcrImage(
                    run_id=run_id,
                    role="preprocessed",
                    path=str(pre.processed_path),
                    page_number=idx,
                    step="preprocess",
                )
                img.set_metadata({"steps": pre.steps})
                session.add(img)

    def _persist_results(
        self,
        run_id: int,
        mode: OcrMode,
        results: list[OcrEngineResult],
        selected_engine: str,
    ) -> None:
        with session_scope() as session:
            for result in results:
                entity = OcrResult(
                    run_id=run_id,
                    engine=result.engine,
                    mode=mode,
                    page_number=result.page_number,
                    text=result.text,
                    confidence=result.confidence,
                )
                entity.set_extra(result.extra)
                session.add(entity)
            run = session.get(OcrRun, run_id)
            if not run:
                raise RuntimeError(f"Run {run_id} not found while persisting results")
            run.status = "completed"
            run.engine_used = selected_engine
            run.set_extra({"selected_engine": selected_engine})
            run.updated_at = datetime.utcnow()

    def process(self, file_bytes: bytes, filename: str, mode: OcrMode = "auto") -> ServiceResult:
        if len(file_bytes) == 0:
            raise HTTPException(status_code=400, detail="Empty file provided")
        max_bytes = CONFIG.allowed_file_size_mb * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Max size is {CONFIG.allowed_file_size_mb} MB",
            )

        mime, _ = mimetypes.guess_type(filename)
        with session_scope() as session:
            temp_run = OcrRun(
                original_file=filename,
                original_mime=mime,
                mode=mode,
                status="initializing",
            )
            session.add(temp_run)
            session.flush()
            run_id = temp_run.id

        run_dirs = STORAGE.prepare_run_directory(run_id)
        saved_path = STORAGE.save_upload(file_bytes, filename, run_dirs["uploads"])
        self._update_run(
            run_id,
            original_file=str(saved_path),
            original_mime=mime,
            status="processing",
        )

        try:
            prepared = DOCUMENT_PROCESSOR.prepare(saved_path, run_dirs)
            self._record_images(run_id, prepared)

            all_results: list[OcrEngineResult] = []
            for idx, prep in enumerate(prepared.preprocessed, start=1):
                if mode in ("fast", "auto"):
                    tess_result = TESSERACT_ENGINE.run(prep.processed_path, page_number=idx)
                    all_results.append(tess_result)
                if mode in ("enhanced", "auto"):
                    paddle_result = PADDLE_ENGINE.run(prep.processed_path, page_number=idx)
                    all_results.append(paddle_result)

            selected_engine = self._select_engine(all_results, mode)
            self._persist_results(run_id, mode, all_results, selected_engine)

            selected_results = [res for res in all_results if res.engine == selected_engine]
            return ServiceResult(run_id=run_id, mode=mode, results=selected_results, selected_engine=selected_engine)
        except Exception as exc:  # noqa: BLE001
            LOGGER.exception("OCR processing failed")
            self._update_run(run_id, status="failed", error_message=str(exc))
            raise HTTPException(status_code=500, detail=f"OCR processing failed: {exc}") from exc

    def _select_engine(self, results: list[OcrEngineResult], mode: OcrMode) -> str:
        if mode == "fast":
            return "tesseract"
        if mode == "enhanced":
            return "paddleocr"

        # Auto mode: choose engine with highest average confidence
        engine_conf: dict[str, list[float]] = {}
        for result in results:
            if result.confidence is not None:
                engine_conf.setdefault(result.engine, []).append(result.confidence)

        if not engine_conf:
            return "tesseract"

        avg_conf = {
            engine: sum(values) / len(values)
            for engine, values in engine_conf.items()
            if values
        }
        if not avg_conf:
            return "tesseract"
        return max(avg_conf, key=avg_conf.get)

    def get_run(self, run_id: int) -> dict:
        with session_scope() as session:
            run = session.get(OcrRun, run_id)
            if not run:
                raise HTTPException(status_code=404, detail="Run not found")
            return {
                "id": run.id,
                "mode": run.mode,
                "status": run.status,
                "engine_used": run.engine_used,
                "original_file": run.original_file,
                "created_at": run.created_at.isoformat(),
                "updated_at": run.updated_at.isoformat(),
                "error_message": run.error_message,
                "extras": run.get_extra(),
                "results": [
                    {
                        "id": result.id,
                        "engine": result.engine,
                        "page_number": result.page_number,
                        "confidence": result.confidence,
                        "text": result.text,
                        "extra": result.get_extra(),
                    }
                    for result in run.results
                ],
                "images": [
                    {
                        "id": image.id,
                        "role": image.role,
                        "path": image.path,
                        "page_number": image.page_number,
                        "step": image.step,
                        "metadata": image.get_metadata(),
                    }
                    for image in run.images
                ],
            }

    def list_runs(self, limit: int = 50) -> list[dict]:
        with session_scope() as session:
            runs = (
                session.query(OcrRun)
                .order_by(OcrRun.created_at.desc())
                .limit(limit)
                .all()
            )
            return [
                {
                    "id": run.id,
                    "mode": run.mode,
                    "status": run.status,
                    "engine_used": run.engine_used,
                    "created_at": run.created_at.isoformat(),
                    "updated_at": run.updated_at.isoformat(),
                    "original_file": run.original_file,
                }
                for run in runs
            ]


SERVICE = OcrService()
