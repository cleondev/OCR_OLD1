from __future__ import annotations

import mimetypes
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from pdf2image import convert_from_path

from .preprocess import PREPROCESSOR, PreprocessResult


SUPPORTED_IMAGE_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/tiff",
    "image/bmp",
    "image/webp",
}


@dataclass
class PreparedDocument:
    original_path: Path
    mime_type: Optional[str]
    page_images: list[Path]
    preprocessed: list[PreprocessResult]
    converted_files: list[tuple[str, Path]]


class DocumentProcessor:
    def __init__(self) -> None:
        self.preprocessor = PREPROCESSOR

    def detect_mime(self, file_path: Path) -> Optional[str]:
        mime, _ = mimetypes.guess_type(file_path)
        return mime

    def _convert_docx_to_pdf(self, docx_path: Path) -> Path:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            result = subprocess.run(
                [
                    "libreoffice",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    str(docx_path),
                    "--outdir",
                    str(tmpdir_path),
                ],
                capture_output=True,
                check=False,
            )
            if result.returncode != 0:
                raise RuntimeError(
                    f"Failed to convert DOCX to PDF: {result.stderr.decode('utf-8', errors='ignore')}"
                )
            pdf_files = list(tmpdir_path.glob("*.pdf"))
            if not pdf_files:
                raise RuntimeError("DOCX conversion did not produce a PDF")
            target_pdf = docx_path.with_suffix(".pdf")
            shutil.move(str(pdf_files[0]), target_pdf)
            return target_pdf

    def _convert_pdf_to_images(self, pdf_path: Path, output_dir: Path) -> list[Path]:
        pages = convert_from_path(str(pdf_path), dpi=300)
        image_paths: list[Path] = []
        for idx, page in enumerate(pages, start=1):
            image_path = self.preprocessor.save_pdf_page(page, output_dir, f"page_{idx:03d}")
            image_paths.append(image_path)
        return image_paths

    def _copy_image(self, image_path: Path, output_dir: Path) -> Path:
        target = output_dir / image_path.name
        shutil.copy(image_path, target)
        return target

    def prepare(self, file_path: Path, run_dirs: dict[str, Path]) -> PreparedDocument:
        mime = self.detect_mime(file_path)
        page_images: list[Path] = []
        converted_files: list[tuple[str, Path]] = []

        if file_path.suffix.lower() in {".doc", ".docx"}:
            pdf_path = self._convert_docx_to_pdf(file_path)
            page_images = self._convert_pdf_to_images(pdf_path, run_dirs["uploads"])
            converted_files.append(("docx_to_pdf", pdf_path))
        elif file_path.suffix.lower() in {".pdf"}:
            page_images = self._convert_pdf_to_images(file_path, run_dirs["uploads"])
        elif mime in SUPPORTED_IMAGE_TYPES:
            copied = self._copy_image(file_path, run_dirs["uploads"])
            page_images = [copied]
        else:
            raise ValueError(f"Unsupported file type: {file_path.suffix}")

        preprocessed: list[PreprocessResult] = []
        for idx, image_path in enumerate(page_images, start=1):
            result = self.preprocessor.enhance(image_path, run_dirs["intermediates"], f"page_{idx:03d}")
            preprocessed.append(result)

        return PreparedDocument(
            original_path=file_path,
            mime_type=mime,
            page_images=page_images,
            preprocessed=preprocessed,
            converted_files=converted_files,
        )


DOCUMENT_PROCESSOR = DocumentProcessor()
