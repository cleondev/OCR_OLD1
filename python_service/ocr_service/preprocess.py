from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import cv2
import numpy as np
from PIL import Image


@dataclass
class PreprocessResult:
    original_path: Path
    processed_path: Path
    steps: list[str]


class ImagePreprocessor:
    """Apply a sequence of preprocessing steps tuned for OCR."""

    def enhance(self, image_path: Path, output_dir: Path, prefix: str) -> PreprocessResult:
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Cannot read image: {image_path}")

        steps: list[str] = []

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        steps.append("grayscale")

        denoised = cv2.fastNlMeansDenoising(gray, h=30, templateWindowSize=7, searchWindowSize=21)
        steps.append("denoise")

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        clahe_img = clahe.apply(denoised)
        steps.append("clahe")

        blurred = cv2.GaussianBlur(clahe_img, (3, 3), 0)
        sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharpened = cv2.filter2D(blurred, -1, sharpen_kernel)
        steps.append("sharpen")

        thresh = cv2.adaptiveThreshold(
            sharpened,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            5,
        )
        steps.append("adaptive_threshold")

        processed_path = output_dir / f"{prefix}_processed.png"
        cv2.imwrite(str(processed_path), thresh)

        return PreprocessResult(original_path=image_path, processed_path=processed_path, steps=steps)

    def save_pdf_page(self, pil_image: Image.Image, output_dir: Path, prefix: str) -> Path:
        path = output_dir / f"{prefix}.png"
        pil_image.save(path)
        return path


PREPROCESSOR = ImagePreprocessor()
