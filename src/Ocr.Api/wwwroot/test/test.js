(() => {
  const form = document.getElementById('ocr-form');
  const resultEl = document.getElementById('result');

  if (!form || !resultEl) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    resultEl.textContent = 'Đang xử lý...';

    try {
      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: data
      });

      if (!response.ok) {
        const errorText = await response.text();
        resultEl.textContent = `Lỗi: ${errorText}`;
        return;
      }

      const json = await response.json();
      resultEl.textContent = JSON.stringify(json, null, 2);
    } catch (error) {
      resultEl.textContent = `Lỗi: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
})();
