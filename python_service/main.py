from __future__ import annotations

import logging
from typing import Annotated

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

from ocr_service.service import SERVICE, OcrMode

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="OCR Service", version="1.0.0")


@app.post("/ocr")
async def run_ocr(
    file: UploadFile = File(...),
    mode: Annotated[OcrMode, Form()] = "auto",
) -> JSONResponse:
    contents = await file.read()
    result = SERVICE.process(contents, file.filename, mode=mode)
    return JSONResponse(
        {
            "run_id": result.run_id,
            "mode": result.mode,
            "selected_engine": result.selected_engine,
            "pages": [
                {
                    "page_number": res.page_number,
                    "engine": res.engine,
                    "confidence": res.confidence,
                    "text": res.text,
                }
                for res in result.results
            ],
        }
    )


@app.get("/ocr/{run_id}")
async def get_run(run_id: int) -> JSONResponse:
    run = SERVICE.get_run(run_id)
    return JSONResponse(run)


@app.get("/ocr")
async def list_runs(limit: int = 50) -> JSONResponse:
    runs = SERVICE.list_runs(limit=limit)
    return JSONResponse({"items": runs})


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})
