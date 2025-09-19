namespace Ocr.Core.Abstractions;

using Ocr.Core;
using Ocr.Core.Entities;

public interface IOcrEngineFactory
{
    IOcrEngine GetEngine(OcrMode mode, DocumentType? documentType = null);
}
