(() => {
  const form = document.getElementById('ocr-form');
  const submitButton = form?.querySelector('button[type="submit"]');
  const resetButton = document.getElementById('reset-form');
  const resultCard = document.getElementById('result-card');
  const summaryEl = document.getElementById('result-summary');
  const fieldsContainer = document.getElementById('fields-container');
  const metadataContainer = document.getElementById('metadata-container');
  const rawJsonCard = document.getElementById('raw-json-card');
  const rawJsonEl = document.getElementById('raw-json');
  const viewFullTextBtn = document.getElementById('view-full-text');
  const downloadBtn = document.getElementById('download-json');
  const suggestionCard = document.getElementById('suggestion-card');
  const tryEnhancedBtn = document.getElementById('try-enhanced');
  const toggleJsonBtn = document.getElementById('toggle-json');
  const modal = document.getElementById('full-text-modal');
  const modalContent = document.getElementById('full-text-content');
  const closeModalBtn = document.getElementById('close-modal');
  const modeSelect = document.getElementById('mode-select');

  let currentResult = null;

  if (!form || !submitButton || !summaryEl || !fieldsContainer || !metadataContainer || !rawJsonCard || !rawJsonEl) {
    return;
  }

  hideResults();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitOcr();
  });

  form.addEventListener('reset', () => {
    hideResults();
  });

  if (tryEnhancedBtn) {
    tryEnhancedBtn.addEventListener('click', () => {
      if (!form.file?.files?.length) {
        showInlineMessage('Vui lòng chọn lại tệp để chạy ENHANCED.');
        return;
      }
      if (modeSelect) {
        modeSelect.value = 'ENHANCED';
      }
      void submitOcr('ENHANCED');
    });
  }

  if (viewFullTextBtn && modal && modalContent && closeModalBtn) {
    viewFullTextBtn.addEventListener('click', () => {
      if (!currentResult) {
        return;
      }
      modalContent.textContent = getValue(currentResult, 'FullText') || 'Không có nội dung.';
      modal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.classList.add('hidden');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        modal.classList.add('hidden');
      }
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (!currentResult) {
        showInlineMessage('Chưa có dữ liệu để tải.');
        return;
      }
      const json = JSON.stringify(currentResult, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const docType = getValue(currentResult, 'DocumentTypeCode') || 'UNKNOWN';
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ocr-result-${docType.toString().toLowerCase()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  if (toggleJsonBtn) {
    toggleJsonBtn.addEventListener('click', () => {
      const collapsed = rawJsonEl.classList.toggle('collapsed');
      toggleJsonBtn.textContent = collapsed ? 'Hiện JSON' : 'Ẩn JSON';
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', hideResults);
  }

  async function submitOcr(overrideMode) {
    const formData = new FormData(form);
    if (overrideMode) {
      formData.set('mode', overrideMode);
    }

    resultCard.classList.remove('hidden');
    summaryEl.textContent = 'Đang xử lý...';
    fieldsContainer.innerHTML = '';
    metadataContainer.innerHTML = '';
    rawJsonCard.classList.add('hidden');
    suggestionCard?.classList.add('hidden');
    rawJsonEl.textContent = '';
    rawJsonEl.classList.remove('collapsed');

    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Đang nhận dạng...';

    try {
      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const json = await response.json();
      renderResult(json);
    } catch (error) {
      summaryEl.textContent = `Lỗi: ${error instanceof Error ? error.message : String(error)}`;
      fieldsContainer.innerHTML = '';
      metadataContainer.innerHTML = '';
      rawJsonCard.classList.add('hidden');
      suggestionCard?.classList.add('hidden');
      currentResult = null;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }

  function renderResult(result) {
    currentResult = result;
    const docType = getValue(result, 'DocumentTypeCode') || 'UNKNOWN';
    const mode = getValue(result, 'Mode') || 'AUTO';
    const fields = getValue(result, 'Fields') || {};
    const metadata = getValue(result, 'Metadata');
    const template = getValue(result, 'TemplateUsed');

    const templateInfo = template ? ` · Template: ${getValue(template, 'Version') || getValue(template, 'version') || 'N/A'}` : '';
    summaryEl.textContent = `DocType: ${docType} · Engine: ${mode}${templateInfo}`;

    const entries = Object.entries(fields);
    if (entries.length === 0) {
      fieldsContainer.innerHTML = '<p class="muted">Chưa trích xuất được trường nào.</p>';
    } else {
      fieldsContainer.innerHTML = '';
      entries.forEach(([key, value]) => {
        const item = document.createElement('div');
        item.className = 'field-item';
        item.innerHTML = `<h4>${escapeHtml(key)}</h4><p>${escapeHtml(String(value))}</p>`;
        fieldsContainer.append(item);
      });
    }

    if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
      metadataContainer.innerHTML = '';
      Object.entries(metadata).forEach(([key, value]) => {
        const span = document.createElement('span');
        span.textContent = `${key}: ${formatMetadataValue(value)}`;
        metadataContainer.append(span);
      });
    } else {
      metadataContainer.innerHTML = '';
    }

    rawJsonEl.textContent = JSON.stringify(result, null, 2);
    rawJsonEl.classList.remove('collapsed');
    rawJsonCard.classList.remove('hidden');
    toggleJsonBtn.textContent = 'Ẩn JSON';

    if (shouldSuggestEnhanced(result)) {
      suggestionCard?.classList.remove('hidden');
    } else {
      suggestionCard?.classList.add('hidden');
    }
  }

  function hideResults() {
    currentResult = null;
    resultCard.classList.add('hidden');
    rawJsonCard.classList.add('hidden');
    suggestionCard?.classList.add('hidden');
    summaryEl.textContent = '';
    fieldsContainer.innerHTML = '';
    metadataContainer.innerHTML = '';
    rawJsonEl.textContent = '';
    rawJsonEl.classList.remove('collapsed');
    modal?.classList.add('hidden');
  }

  function shouldSuggestEnhanced(result) {
    const mode = (getValue(result, 'Mode') || '').toString().toUpperCase();
    if (!mode.includes('FAST')) {
      return false;
    }

    const fields = getValue(result, 'Fields') || {};
    const fieldCount = Object.keys(fields).length;
    const fullText = (getValue(result, 'FullText') || '').toString();
    return fieldCount === 0 || fullText.length < 40;
  }

  function showInlineMessage(message) {
    summaryEl.textContent = message;
    resultCard.classList.remove('hidden');
  }

  function getValue(obj, key) {
    if (!obj) {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
    const camel = key.charAt(0).toLowerCase() + key.slice(1);
    if (Object.prototype.hasOwnProperty.call(obj, camel)) {
      return obj[camel];
    }
    return undefined;
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMetadataValue(value) {
    if (value === null || value === undefined) {
      return '—';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }
})();
