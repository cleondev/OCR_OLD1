const API_BASE = '/api/mock';

const state = {
  docTypes: [],
  docTypeDetails: {},
  sampleCache: {},
  loading: false,
  toast: null
};

const uiState = {
  sampleFormFor: null,
  newTemplateFor: null,
  templateTestSelection: {},
  newSamplerFor: null,
  datasetFilterDocType: 'all',
  trainingScope: {}
};

let lastRouteSegments = [];
let sidebarEventsBound = false;
const dataTableInstances = [];

function cleanupDataTables() {
  while (dataTableInstances.length) {
    const instance = dataTableInstances.pop();
    if (instance && typeof instance.destroy === 'function') {
      instance.destroy();
    }
  }
}

function enhanceDataTables(container) {
  if (!container) {
    return;
  }

  const lib = window.simpleDatatables;
  if (!lib || typeof lib.DataTable !== 'function') {
    return;
  }

  const tables = container.querySelectorAll('[data-enhance="datatable"]');
  tables.forEach((table) => {
    const instance = new lib.DataTable(table, {
      searchable: true,
      fixedHeight: false,
      perPage: 10,
      perPageSelect: [5, 10, 20, 50],
      labels: {
        placeholder: 'Tìm kiếm...',
        perPage: '{select} dòng mỗi trang',
        noRows: 'Không có dữ liệu phù hợp',
        info: 'Hiển thị {start} - {end} / {rows}',
        loading: 'Đang tải...',
        infoFiltered: '(lọc từ tổng {rowsTotal})'
      }
    });
    dataTableInstances.push(instance);
  });
}

function resetDocTypeScopedUiState() {
  uiState.sampleFormFor = null;
  uiState.newTemplateFor = null;
  uiState.newSamplerFor = null;
  uiState.templateTestSelection = {};
}

function resetUiStateOutsideTab(activeTab) {
  if (activeTab !== 'dataset') {
    uiState.sampleFormFor = null;
  }
  if (activeTab !== 'templates') {
    uiState.newTemplateFor = null;
    uiState.templateTestSelection = {};
  }
  if (activeTab !== 'samplers') {
    uiState.newSamplerFor = null;
  }
}

function applyRouteUiState(nextSegments) {
  if (!Array.isArray(nextSegments)) {
    lastRouteSegments = [];
    resetDocTypeScopedUiState();
    return;
  }

  const nextTop = nextSegments[0];
  if (nextTop !== 'doc-types') {
    resetDocTypeScopedUiState();
    lastRouteSegments = nextSegments.slice();
    return;
  }

  const nextSecond = nextSegments[1];
  if (!nextSecond || nextSecond === 'new') {
    resetDocTypeScopedUiState();
    lastRouteSegments = nextSegments.slice();
    return;
  }

  const nextDocId = Number(nextSecond);
  if (Number.isNaN(nextDocId)) {
    resetDocTypeScopedUiState();
    lastRouteSegments = nextSegments.slice();
    return;
  }

  const previousDocIdSegment = lastRouteSegments[0] === 'doc-types' && lastRouteSegments[1] && lastRouteSegments[1] !== 'new'
    ? Number(lastRouteSegments[1])
    : NaN;

  if (Number.isNaN(previousDocIdSegment) || previousDocIdSegment !== nextDocId) {
    resetDocTypeScopedUiState();
    lastRouteSegments = nextSegments.slice();
    return;
  }

  const previousTab = normalizeDocTypeTab(lastRouteSegments[2]);
  const nextTab = normalizeDocTypeTab(nextSegments[2]);
  if (previousTab !== nextTab) {
    resetUiStateOutsideTab(nextTab);
  }

  lastRouteSegments = nextSegments.slice();
}

document.addEventListener('keydown', handleNavigationShortcut);

function handleNavigationShortcut(event) {
  if (!event.ctrlKey || !event.altKey) {
    return;
  }

  if (shouldIgnoreShortcutTarget(event.target)) {
    return;
  }

  const key = event.key ? event.key.toLowerCase() : '';
  if (key === 't') {
    event.preventDefault();
    showToast('Đang chuyển sang Test (Ctrl+Alt+T)...');
    window.location.href = '/test';
  } else if (key === 'a') {
    event.preventDefault();
    if (window.location.pathname !== '/admin') {
      window.location.href = '/admin';
    }
  }
}

function renderDatasetExplorer() {
  const filterValue = uiState.datasetFilterDocType;
  const options = state.docTypes
    .map((dt) => {
      const id = getValue(dt, 'Id');
      const name = getValue(dt, 'Name');
      return `<option value="${id}" ${filterValue === String(id) ? 'selected' : ''}>${escapeHtml(name)}</option>`;
    })
    .join('');

  const allSamples = [];
  state.docTypes.forEach((dt) => {
    const id = getValue(dt, 'Id');
    const detail = state.docTypeDetails[id];
    if (!detail) {
      return;
    }
    const docSamples = getValue(detail, 'Samples') || [];
    docSamples.forEach((sample) => {
      allSamples.push({
        docTypeId: id,
        docTypeName: getValue(dt, 'Name'),
        sample
      });
    });
  });

  const filtered = allSamples.filter((entry) => {
    if (filterValue === 'all') {
      return true;
    }
    return String(entry.docTypeId) === filterValue;
  });

  filtered.sort((a, b) => {
    const aUpdated = new Date(getValue(a.sample, 'UpdatedAt') || getValue(a.sample, 'UploadedAt') || 0).getTime();
    const bUpdated = new Date(getValue(b.sample, 'UpdatedAt') || getValue(b.sample, 'UploadedAt') || 0).getTime();
    return bUpdated - aUpdated;
  });

  let verified = 0;
  let training = 0;
  let accuracySum = 0;
  let accuracyCount = 0;

  const rows = filtered
    .map(({ docTypeId, docTypeName, sample }) => {
      const id = getValue(sample, 'Id');
      const fileName = getValue(sample, 'FileName');
      const status = getValue(sample, 'Status');
      const isVerified = getValue(sample, 'IsVerified');
      const included = getValue(sample, 'IncludedInTraining');
      const accuracy = getValue(sample, 'Accuracy');
      const updatedAt = formatDateTime(getValue(sample, 'UpdatedAt') || getValue(sample, 'UploadedAt'));

      if (isVerified) {
        verified += 1;
      }
      if (included) {
        training += 1;
      }
      if (accuracy !== null && accuracy !== undefined && !Number.isNaN(Number(accuracy))) {
        accuracySum += Number(accuracy);
        accuracyCount += 1;
      }

      return `
        <tr>
          <td>
            <strong>${escapeHtml(fileName)}</strong>
            <div class="inline-hint">${escapeHtml(docTypeName)}</div>
          </td>
          <td>${escapeHtml(status)}</td>
          <td>
            <label class="checkbox-row">
              <input type="checkbox" data-action="toggle-verify" data-id="${id}" data-doc-id="${docTypeId}" ${isVerified ? 'checked' : ''} />
              Verify
            </label>
          </td>
          <td>
            <label class="checkbox-row">
              <input type="checkbox" data-action="toggle-training" data-id="${id}" data-doc-id="${docTypeId}" ${included ? 'checked' : ''} ${getValue(sample, 'IsLabeled') ? '' : 'disabled'} />
              Train
            </label>
          </td>
          <td>${formatAccuracy(accuracy)}</td>
          <td>${updatedAt}</td>
          <td><a class="button secondary" href="#/samples/${id}">Chi tiết</a></td>
        </tr>
      `;
    })
    .join('');

  const averageAccuracy = accuracyCount ? `${(accuracySum / accuracyCount).toFixed(1)}%` : '—';

  return `
    <div class="main-header">
      <div>
        <h2>Kho dữ liệu huấn luyện</h2>
        <p class="inline-hint">Theo dõi toàn bộ tài liệu đã upload, trạng thái verify và mức độ sẵn sàng cho huấn luyện.</p>
      </div>
      <div class="actions dataset-filter">
        <label>Loại tài liệu
          <select id="dataset-filter">
            <option value="all" ${filterValue === 'all' ? 'selected' : ''}>Tất cả</option>
            ${options}
          </select>
        </label>
      </div>
    </div>
    <div class="panel">
      <div class="meta-block">
        <span>Tổng: ${filtered.length}</span>
        <span>Verify: ${verified}</span>
        <span>Trong tập train: ${training}</span>
        <span>Độ chính xác TB: ${averageAccuracy}</span>
      </div>
      <div class="table-wrapper">
        <table data-enhance="datatable" data-table-key="dataset-explorer">
          <thead>
            <tr>
              <th>Tài liệu</th>
              <th>Trạng thái</th>
              <th>Verify</th>
              <th>Huấn luyện</th>
              <th>Độ chính xác</th>
              <th>Cập nhật</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="7"><div class="empty-state">Không có tài liệu phù hợp bộ lọc.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderTrainingHub() {
  const rows = state.docTypes.map((dt) => {
    const id = getValue(dt, 'Id');
    const name = getValue(dt, 'Name');
    const dataset = getValue(dt, 'Dataset') || {};
    const lastTraining = getValue(dt, 'LastTraining');
    const mode = getValue(lastTraining, 'Mode');
    const summary = getValue(lastTraining, 'Summary');
    const completed = lastTraining ? formatDateTime(getValue(lastTraining, 'CompletedAt') || getValue(lastTraining, 'CreatedAt')) : '—';
    const improvement = lastTraining && getValue(lastTraining, 'BaselineAccuracy') && getValue(lastTraining, 'ImprovedAccuracy')
      ? `${formatAccuracy(getValue(lastTraining, 'BaselineAccuracy'))} → ${formatAccuracy(getValue(lastTraining, 'ImprovedAccuracy'))}`
      : '—';

    return `
      <tr>
        <td>
          <strong>${escapeHtml(name)}</strong>
          <div class="inline-hint">${getValue(dataset, 'Summary') || 'Chưa thiết lập tập dữ liệu'}</div>
        </td>
        <td>${formatAccuracy(getValue(dataset, 'AverageAccuracy'))}</td>
        <td>${getValue(dataset, 'Verified') ?? 0}</td>
        <td>${getValue(dataset, 'Training') ?? 0}</td>
        <td>${completed}</td>
        <td>${mode ? `<span class="badge-outline">${escapeHtml(mode)}</span>` : '—'}</td>
        <td>${summary ? escapeHtml(summary) : '<span class="inline-hint">Chưa có</span>'}</td>
        <td>${improvement}</td>
        <td><button class="button" data-action="open-training" data-id="${id}">Quản lý huấn luyện</button></td>
      </tr>
    `;
  });

  return `
    <div class="main-header">
      <div>
        <h2>Trung tâm huấn luyện</h2>
        <p class="inline-hint">Chọn loại tài liệu để điều chỉnh tập dữ liệu và kích hoạt tối ưu OCR.</p>
      </div>
    </div>
    <div class="panel">
      <div class="table-wrapper">
        <table data-enhance="datatable" data-table-key="training-hub">
          <thead>
            <tr>
              <th>Loại tài liệu</th>
              <th>Accuracy TB</th>
              <th>Verify</th>
              <th>Train</th>
              <th>Huấn luyện gần nhất</th>
              <th>Chế độ</th>
              <th>Tóm tắt</th>
              <th>Cải thiện</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.join('') || '<tr><td colspan="9"><div class="empty-state">Chưa có loại tài liệu nào được cấu hình.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function bindDatasetExplorerEvents() {
  const filter = document.getElementById('dataset-filter');
  if (filter) {
    filter.addEventListener('change', () => {
      uiState.datasetFilterDocType = filter.value;
      renderApp();
    });
  }

  document.querySelectorAll('input[data-action="toggle-verify"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const sampleId = Number(input.dataset.id);
      const docTypeId = Number(input.dataset.docId);
      const desired = input.checked;
      try {
        await fetchJson(`${API_BASE}/samples/${sampleId}/verify`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isVerified: desired })
        });
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast(desired ? 'Đã đánh dấu verify' : 'Đã bỏ verify');
        renderApp();
      } catch (error) {
        input.checked = !desired;
        showToast(error instanceof Error ? error.message : 'Không thể cập nhật verify');
      }
    });
  });

  document.querySelectorAll('input[data-action="toggle-training"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const sampleId = Number(input.dataset.id);
      const docTypeId = Number(input.dataset.docId);
      const desired = input.checked;
      try {
        await fetchJson(`${API_BASE}/samples/${sampleId}/training`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includedInTraining: desired })
        });
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast(desired ? 'Đã thêm vào tập train' : 'Đã loại khỏi tập train');
        renderApp();
      } catch (error) {
        input.checked = !desired;
        showToast(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái train');
      }
    });
  });
}

function bindTrainingHubEvents() {
  document.querySelectorAll('button[data-action="open-training"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      if (!Number.isNaN(id)) {
        navigateTo(`#/doc-types/${id}/training`);
      }
    });
  });
}

function shouldIgnoreShortcutTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable;
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', () => {
    void handleRouteChange();
  });
  void handleRouteChange();
});

async function handleRouteChange() {
  const segments = parseHash();
  applyRouteUiState(segments);
  if (segments.length === 0) {
    navigateTo('#/doc-types');
    return;
  }

  try {
    state.loading = true;
    renderApp();

    if (state.docTypes.length === 0) {
      await loadDocTypeSummaries();
    }

    const topRoute = segments[0];

    if (segments[0] === 'doc-types' && segments[1]) {
      const docTypeId = Number(segments[1]);
      if (!Number.isNaN(docTypeId)) {
        await ensureDocTypeDetail(docTypeId);
      }
    }

    if ((topRoute === 'datasets' || topRoute === 'training') && state.docTypes.length) {
      await Promise.all(
        state.docTypes.map((dt) => ensureDocTypeDetail(getValue(dt, 'Id')))
      );
    }

    if (segments[0] === 'samples' && segments[1]) {
      const sampleId = Number(segments[1]);
      if (!Number.isNaN(sampleId)) {
        await ensureSample(sampleId);
      }
    }
  } catch (error) {
    console.error(error);
    showToast(error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định');
  } finally {
    state.loading = false;
    renderApp();
  }
}

async function loadDocTypeSummaries() {
  const data = await fetchJson(`${API_BASE}/doc-types`);
  state.docTypes = Array.isArray(data)
    ? data.sort((a, b) => new Date(getValue(b, 'UpdatedAt')).getTime() - new Date(getValue(a, 'UpdatedAt')).getTime())
    : [];
}

async function uploadSampleFilesForDocType(docTypeId, files, uploadedBy) {
  if (!docTypeId || !files || !files.length) {
    return [];
  }

  const formData = new FormData();
  files.forEach((file) => {
    if (file) {
      formData.append('files', file);
    }
  });

  if (!formData.has('files')) {
    return [];
  }

  if (uploadedBy) {
    formData.append('uploadedBy', uploadedBy);
  }

  return fetchJson(`${API_BASE}/doc-types/${docTypeId}/sample-files`, {
    method: 'POST',
    body: formData
  });
}

async function ensureDocTypeDetail(id, options = {}) {
  const { force = false } = options;
  if (!force && state.docTypeDetails[id]) {
    return state.docTypeDetails[id];
  }

  const detail = await fetchJson(`${API_BASE}/doc-types/${id}`);
  state.docTypeDetails[id] = detail;
  return detail;
}

async function ensureSample(sampleId) {
  if (state.sampleCache[sampleId]) {
    return state.sampleCache[sampleId];
  }

  const sample = await fetchJson(`${API_BASE}/samples/${sampleId}`);
  state.sampleCache[sampleId] = sample;
  const docTypeId = getValue(sample, 'DocumentTypeId');
  if (docTypeId) {
    const docType = state.docTypeDetails[docTypeId];
    if (docType) {
      const samples = getValue(docType, 'Samples') || [];
      const index = samples.findIndex((s) => getValue(s, 'Id') === sampleId);
      if (index >= 0) {
        samples[index] = sample;
      } else {
        samples.unshift(sample);
      }
    }
  }
  return sample;
}

function renderApp() {
  const root = document.getElementById('app-root');
  if (!root) {
    return;
  }

  const main = root.querySelector('main');
  if (!main) {
    return;
  }

  const segments = parseHash();
  bindSidebarEvents();
  updateSidebar(root, segments);

  cleanupDataTables();
  const mainContent = renderMainContent(segments);
  main.innerHTML = mainContent;

  enhanceDataTables(main);
  updateToast();
  bindContentEvents(segments);
}

function updateSidebar(root, segments) {
  const topRoute = segments[0] || 'doc-types';
  const navLinks = root.querySelectorAll('[data-nav]');
  navLinks.forEach((link) => {
    const target = link.getAttribute('data-nav');
    if (!target) {
      return;
    }
    if (target === topRoute) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

function updateToast() {
  const container = document.getElementById('toast-container');
  if (!container) {
    return;
  }

  if (!state.toast) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `<div class="toast">${escapeHtml(state.toast)}</div>`;
}

function renderMainContent(segments) {
  if (segments[0] === 'doc-types' && segments[1] === 'new') {
    return renderDocTypeCreatePage();
  }

  if (state.loading && state.docTypes.length === 0) {
    return renderLoading('Đang tải dữ liệu mock...');
  }

  if (segments[0] === 'datasets') {
    return renderDatasetExplorer();
  }

  if (segments[0] === 'training') {
    return renderTrainingHub();
  }

  if (segments[0] === 'doc-types' && !segments[1]) {
    return renderDocTypeList();
  }

  if (segments[0] === 'doc-types' && segments[1]) {
    const docTypeId = Number(segments[1]);
    if (Number.isNaN(docTypeId)) {
      return `<div class="panel"><p>Không tìm thấy loại tài liệu yêu cầu.</p></div>`;
    }
    const docType = state.docTypeDetails[docTypeId];
    if (!docType) {
      return renderLoading('Đang tải chi tiết loại tài liệu...');
    }

    const tab = normalizeDocTypeTab(segments[2]);
    const extra = segments.slice(3);
    return renderDocTypeDetail(docType, tab, extra);
  }

  if (segments[0] === 'samples' && segments[1]) {
    const sampleId = Number(segments[1]);
    const sample = state.sampleCache[sampleId] || findSample(sampleId);
    if (!sample) {
      return renderLoading('Đang tải dữ liệu mẫu...');
    }
    return renderSampleDetail(sample);
  }

  return `<div class="panel"><p>Không tìm thấy nội dung phù hợp.</p></div>`;
}

function renderLoading(message) {
  return `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderDocTypeList() {
  const rows = state.docTypes.map((dt) => {
    const id = getValue(dt, 'Id');
    const code = getValue(dt, 'Code');
    const name = getValue(dt, 'Name');
    const preferredMode = getValue(dt, 'PreferredMode');
    const dataset = getValue(dt, 'Dataset') || {};
    const stats = getValue(dt, 'Stats') || {};
    const lastTraining = getValue(dt, 'LastTraining');
    const updatedAt = formatDateTime(getValue(dt, 'UpdatedAt'));
    const datasetSummary = getValue(dataset, 'Summary') || '';
    const lastTrainingTime = lastTraining
      ? formatDateTime(getValue(lastTraining, 'CompletedAt') || getValue(lastTraining, 'CreatedAt'))
      : '—';
    const improvement = lastTraining && getValue(lastTraining, 'BaselineAccuracy') && getValue(lastTraining, 'ImprovedAccuracy')
      ? `${formatAccuracy(getValue(lastTraining, 'ImprovedAccuracy'))} (${formatAccuracy(getValue(lastTraining, 'BaselineAccuracy'))} → ${formatAccuracy(getValue(lastTraining, 'ImprovedAccuracy'))})`
      : '—';

    return `
      <tr>
        <td>
          <strong>${escapeHtml(name)}</strong>
          <div class="inline-hint">Mã: ${escapeHtml(code)}</div>
        </td>
        <td><span class="mode-pill">${escapeHtml(preferredMode || 'AUTO')}</span></td>
        <td>${stats.Samples ?? 0}</td>
        <td>${getValue(dataset, 'Verified') ?? 0}</td>
        <td>${getValue(dataset, 'Training') ?? 0}</td>
        <td>${formatAccuracy(getValue(dataset, 'AverageAccuracy'))}</td>
        <td>
          ${lastTraining ? escapeHtml(datasetSummary || '') : '<span class="inline-hint">Chưa huấn luyện</span>'}
          <div class="inline-hint">${lastTrainingTime}</div>
        </td>
        <td>${improvement}</td>
        <td>
          <div class="table-actions">
            <a class="button" href="#/doc-types/${id}/configuration">Quản lý</a>
            <button class="button secondary" type="button" data-action="view-doc" data-id="${id}">Chi tiết</button>
          </div>
          <div class="inline-hint">Cập nhật: ${updatedAt}</div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="main-header">
      <div>
        <h2>Quản lý loại tài liệu</h2>
        <p class="inline-hint">Danh sách ở dạng bảng giúp so sánh nhanh tập dữ liệu và lịch sử huấn luyện của từng loại.</p>
      </div>
      <div class="actions">
        <button class="button" id="open-create-doc-type">+ Tạo loại tài liệu</button>
      </div>
    </div>
    <div class="panel">
      <div class="table-wrapper">
        <table class="doc-type-table" data-enhance="datatable" data-table-key="doc-type-list">
          <thead>
            <tr>
              <th>Loại tài liệu</th>
              <th>Chế độ</th>
              <th>Tổng mẫu</th>
              <th>Đã verify</th>
              <th>Trong tập train</th>
              <th>Độ chính xác TB</th>
              <th>Tập dữ liệu huấn luyện</th>
              <th>Hiệu quả</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="9"><div class="empty-state">Chưa có loại tài liệu nào, hãy tạo mới.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDocTypeCreatePage() {
  return `
    <div class="main-header">
      <div>
        <h2>Tạo loại tài liệu</h2>
        <p class="inline-hint">Thiết lập metadata và tải lên tài liệu mẫu ban đầu cho docType mới.</p>
      </div>
      <div class="actions">
        <button class="button secondary" type="button" id="back-to-doc-type-list">Quay lại danh sách</button>
      </div>
    </div>
    ${renderDocTypeCreateForm()}
  `;
}

function renderDocTypeCreateForm() {
  return `
    <form class="panel" id="create-doc-type-form">
      <h3>Tạo loại tài liệu mới</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>Mã loại tài liệu</label>
          <input name="code" placeholder="VD: CCCD_NEW" required />
        </div>
        <div class="form-field">
          <label>Tên hiển thị</label>
          <input name="name" placeholder="Tên hiển thị" required />
        </div>
        <div class="form-field">
          <label>Chế độ OCR mặc định</label>
          <select name="preferredMode">
            <option value="AUTO">Auto</option>
            <option value="FAST">FAST</option>
            <option value="ENHANCED">ENHANCED</option>
          </select>
        </div>
        <div class="form-field">
          <label>Mô tả</label>
          <textarea name="description" rows="3" placeholder="Ghi chú ngắn" class="small"></textarea>
        </div>
        <div class="form-field">
          <label>Schema JSON</label>
          <textarea name="schemaJson" class="small" placeholder='{"fields":["id","name"]}'></textarea>
        </div>
        <div class="form-field">
          <label>OCR Config JSON</label>
          <textarea name="ocrConfigJson" class="small" placeholder='{"psm":6}'></textarea>
        </div>
      </div>
      <div class="form-section">
        <h4>Tài liệu mẫu ban đầu</h4>
        <p class="inline-hint">Chọn các file ảnh/PDF để tạo sẵn tập dữ liệu demo cho loại tài liệu này.</p>
        <div class="form-grid">
          <div class="form-field">
            <label>Người upload</label>
            <input name="sampleUploadedBy" placeholder="ten.nguoidung" />
          </div>
          <div class="form-field full-width">
            <label>Tài liệu mẫu (tùy chọn)</label>
            <input type="file" name="sampleFiles" multiple accept=".png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,.pdf" />
            <div class="inline-hint">Có thể chọn nhiều file ảnh hoặc PDF. Các file sẽ được lưu trong kho mẫu giả lập.</div>
            <ul class="file-list empty" data-role="sample-file-list">
              <li>Chưa chọn tài liệu nào</li>
            </ul>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Tạo</button>
        <button class="button secondary" type="button" id="cancel-create-doc-type">Hủy</button>
      </div>
    </form>
  `;
}

function normalizeDocTypeTab(value) {
  const normalized = (value || 'configuration').toLowerCase();
  if (normalized === 'overview' || normalized === 'configuration') {
    return 'configuration';
  }
  if (normalized === 'samples' || normalized === 'dataset') {
    return 'dataset';
  }
  return normalized;
}

function renderDocTypeDetail(docType, tab, extra) {
  const id = getValue(docType, 'Id');
  const name = getValue(docType, 'Name');
  const code = getValue(docType, 'Code');
  const preferredMode = getValue(docType, 'PreferredMode');
  const description = getValue(docType, 'Description');

  const tabs = [
    { key: 'configuration', label: 'Cấu hình' },
    { key: 'dataset', label: 'Tập dữ liệu' },
    { key: 'templates', label: 'Templates' },
    { key: 'samplers', label: 'Samplers' },
    { key: 'training', label: 'Huấn luyện' }
  ];

  const tabNav = tabs
    .map((t) => `<a href="#/doc-types/${id}/${t.key}" class="${tab === t.key ? 'active' : ''}">${t.label}</a>`)
    .join('');

  let content = '';
  switch (tab) {
    case 'dataset':
      content = renderDocTypeDataset(docType);
      break;
    case 'templates':
      content = renderDocTypeTemplates(docType, extra);
      break;
    case 'samplers':
      content = renderDocTypeSamplers(docType);
      break;
    case 'training':
      content = renderDocTypeTraining(docType);
      break;
    case 'configuration':
    default:
      content = renderDocTypeConfiguration(docType);
      break;
  }

  return `
    <div class="main-header">
      <div>
        <h2>${escapeHtml(name)}</h2>
        <p class="inline-hint">Mã: ${escapeHtml(code)}</p>
      </div>
      <div class="actions">
        <span class="mode-pill">${escapeHtml(preferredMode || 'AUTO')}</span>
        <button class="button secondary" type="button" id="refresh-doc-type">Làm mới</button>
        <a class="button" href="#/doc-types/${id}/dataset">Tập dữ liệu</a>
      </div>
    </div>
    <div class="alert-info">
      ${escapeHtml(description || 'Chưa có mô tả.')}<br/>
      <span class="inline-hint">Chọn tab để quản lý cấu hình, tập dữ liệu, template, sampler và huấn luyện.</span>
    </div>
    <div class="tab-nav">${tabNav}</div>
    ${content}
  `;
}

function renderDocTypeConfiguration(docType) {
  const schema = getValue(docType, 'SchemaJson');
  const ocrConfig = getValue(docType, 'OcrConfigJson');
  const createdAt = formatDateTime(getValue(docType, 'CreatedAt'));
  const updatedAt = formatDateTime(getValue(docType, 'UpdatedAt'));
  const samples = getValue(docType, 'Samples') || [];
  const templates = getValue(docType, 'Templates') || [];
  const samplers = getValue(docType, 'Samplers') || [];
  const dataset = getValue(docType, 'Dataset') || {};
  const lastTraining = (getValue(docType, 'TrainingJobs') || [])[0];
  const total = dataset.Total ?? samples.length;
  const verified = dataset.Verified ?? samples.filter((s) => getValue(s, 'IsVerified')).length;
  const training = dataset.Training ?? samples.filter((s) => getValue(s, 'IncludedInTraining')).length;
  const averageAccuracy = formatAccuracy(getValue(dataset, 'AverageAccuracy'));
  const evaluations = getValue(dataset, 'RecentEvaluations') || [];

  const evaluationHistory = evaluations.length
    ? `
        <div class="panel">
          <h3>Đánh giá gần đây</h3>
          <div class="history-list">
            ${evaluations
              .map((item) => `
                <div class="history-item">
                  <h4>${escapeHtml(getValue(item, 'SampleFileName') || 'Sample #'+getValue(item, 'SampleId'))}</h4>
                  <p><strong>${formatAccuracy(getValue(item, 'Accuracy'))}</strong> · ${escapeHtml(getValue(item, 'Notes') || '')}</p>
                  <time>${formatDateTime(getValue(item, 'ComparedAt'))}</time>
                </div>
              `)
              .join('')}
          </div>
        </div>
      `
    : '';

  return `
    <div class="grid columns-3 metric-grid">
      <div class="metric-card">
        <h4>Tài liệu đang quản lý</h4>
        <strong>${total}</strong>
        <span class="inline-hint">${verified} đã verify · ${training} dùng huấn luyện</span>
      </div>
      <div class="metric-card">
        <h4>Templates & Samplers</h4>
        <strong>${templates.length} template</strong>
        <span class="inline-hint">${samplers.length} sampler khả dụng</span>
      </div>
      <div class="metric-card">
        <h4>Độ chính xác trung bình</h4>
        <strong>${averageAccuracy}</strong>
        <span class="inline-hint">Cập nhật gần nhất: ${updatedAt}</span>
      </div>
    </div>
    <form class="panel" id="doc-type-form" data-doc-id="${getValue(docType, 'Id')}">
      <h3>Cấu hình loại tài liệu</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>Tên hiển thị</label>
          <input name="name" value="${escapeAttribute(getValue(docType, 'Name'))}" required />
        </div>
        <div class="form-field">
          <label>Mô tả</label>
          <textarea name="description" class="small">${escapeHtml(getValue(docType, 'Description') || '')}</textarea>
        </div>
        <div class="form-field">
          <label>Chế độ OCR mặc định</label>
          <select name="preferredMode">
            ${['AUTO', 'FAST', 'ENHANCED'].map((mode) => `<option value="${mode}" ${mode === getValue(docType, 'PreferredMode') ? 'selected' : ''}>${mode}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>Schema JSON</label>
          <textarea name="schemaJson" class="small">${escapeHtml(schema || '')}</textarea>
        </div>
        <div class="form-field">
          <label>OCR Config JSON</label>
          <textarea name="ocrConfigJson" class="small">${escapeHtml(ocrConfig || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Lưu cấu hình</button>
      </div>
      <p class="inline-hint">Tạo: ${createdAt} · Cập nhật: ${updatedAt}</p>
    </form>
    ${lastTraining ? renderLastTraining(lastTraining) : ''}
    ${evaluationHistory}
  `;
}
function renderLastTraining(job) {
  const summary = getValue(job, 'Summary');
  const created = formatDateTime(getValue(job, 'CreatedAt'));
  const completed = formatDateTime(getValue(job, 'CompletedAt'));
  const mode = getValue(job, 'Mode');
  const datasetSummary = getValue(job, 'DatasetSummary');
  const improvement = getValue(job, 'BaselineAccuracy') && getValue(job, 'ImprovedAccuracy')
    ? `${formatAccuracy(getValue(job, 'BaselineAccuracy'))} → ${formatAccuracy(getValue(job, 'ImprovedAccuracy'))}`
    : null;
  return `
    <div class="panel">
      <h3>Huấn luyện gần nhất</h3>
      <p><span class="badge-outline">${escapeHtml(mode)}</span> · Bắt đầu: ${created}</p>
      <p class="inline-hint">Hoàn tất: ${completed}</p>
      <p>${escapeHtml(summary || '')}</p>
      ${datasetSummary ? `<p class="inline-hint">Dataset: ${escapeHtml(datasetSummary)}</p>` : ''}
      ${improvement ? `<p class="inline-hint">Accuracy: ${improvement}</p>` : ''}
    </div>
  `;
}

function renderDocTypeDataset(docType) {
  const docTypeId = getValue(docType, 'Id');
  const samples = getValue(docType, 'Samples') || [];
  const dataset = getValue(docType, 'Dataset') || {};
  const total = dataset.Total ?? samples.length;
  const verified = dataset.Verified ?? samples.filter((s) => getValue(s, 'IsVerified')).length;
  const training = dataset.Training ?? samples.filter((s) => getValue(s, 'IncludedInTraining')).length;
  const averageAccuracy = formatAccuracy(getValue(dataset, 'AverageAccuracy'));

  const rows = samples
    .map((sample) => {
      const id = getValue(sample, 'Id');
      const fileName = getValue(sample, 'FileName');
      const status = getValue(sample, 'Status');
      const isLabeled = getValue(sample, 'IsLabeled');
      const isVerified = getValue(sample, 'IsVerified');
      const included = getValue(sample, 'IncludedInTraining');
      const uploadedBy = getValue(sample, 'UploadedBy');
      const uploadedAt = formatDateTime(getValue(sample, 'UploadedAt'));
      const updatedAt = formatDateTime(getValue(sample, 'UpdatedAt') || getValue(sample, 'UploadedAt'));
      const accuracy = formatAccuracy(getValue(sample, 'Accuracy'));
      const comparisons = getValue(sample, 'ComparisonHistory') || [];
      const latest = comparisons[0] || null;
      const comparedAt = latest ? formatDateTime(getValue(latest, 'ComparedAt')) : '—';
      const compareNote = latest ? escapeHtml(getValue(latest, 'Notes') || '') : '<span class="inline-hint">Chưa có</span>';

      return `
        <tr>
          <td>
            <strong>${escapeHtml(fileName)}</strong>
            <div class="inline-hint">Upload bởi ${escapeHtml(uploadedBy)} · ${uploadedAt}</div>
          </td>
          <td>${escapeHtml(status)}</td>
          <td>
            <label class="checkbox-row">
              <input type="checkbox" data-action="toggle-verify" data-id="${id}" ${isVerified ? 'checked' : ''} />
              Đã xác minh
            </label>
          </td>
          <td>
            <label class="checkbox-row">
              <input type="checkbox" data-action="toggle-training" data-id="${id}" ${included ? 'checked' : ''} ${isLabeled ? '' : 'disabled'} />
              Dùng để train
            </label>
            ${isLabeled ? '' : '<div class="inline-hint">Cần gán nhãn trước</div>'}
          </td>
          <td>${accuracy}</td>
          <td>
            ${comparedAt}
            <div class="inline-hint">${compareNote}</div>
          </td>
          <td><a class="button secondary" href="#/samples/${id}">Chi tiết</a></td>
        </tr>
      `;
    })
    .join('');

  const createForm = uiState.sampleFormFor === docTypeId ? renderSampleCreateForm(docTypeId) : '';

  return `
    <div class="panel">
      <div class="flex-between">
        <div>
          <h3>Tập dữ liệu (${total})</h3>
          <div class="inline-hint">${verified} đã verify · ${training} dùng huấn luyện · Độ chính xác TB ${averageAccuracy}</div>
        </div>
        <button class="button" type="button" data-action="toggle-create-sample" data-id="${docTypeId}">+ Thêm tài liệu</button>
      </div>
      ${createForm}
      ${samples.length ? `
        <div class="table-wrapper">
          <table data-enhance="datatable" data-table-key="doc-type-dataset-${docTypeId}">
            <thead>
              <tr>
                <th>Tài liệu</th>
                <th>Trạng thái</th>
                <th>Verify</th>
                <th>Huấn luyện</th>
                <th>Độ chính xác</th>
                <th>So sánh gần nhất</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state">Chưa có mẫu nào, hãy thêm tài liệu mới.</div>'}
    </div>
    ${renderDatasetInsights(dataset)}
  `;
}

function renderDatasetInsights(dataset) {
  const evaluations = getValue(dataset, 'RecentEvaluations') || [];
  if (!evaluations.length) {
    return '';
  }

  const items = evaluations
    .map((item) => `
      <div class="history-item">
        <h4>${escapeHtml(getValue(item, 'SampleFileName') || 'Sample #' + getValue(item, 'SampleId'))}</h4>
        <p><strong>${formatAccuracy(getValue(item, 'Accuracy'))}</strong> · ${escapeHtml(getValue(item, 'Notes') || '')}</p>
        <time>${formatDateTime(getValue(item, 'ComparedAt'))}</time>
      </div>
    `)
    .join('');

  return `
    <div class="panel">
      <h3>Đánh giá gần đây</h3>
      <div class="history-list">${items}</div>
    </div>
  `;
}

function renderSampleCreateForm(docTypeId) {
  return `
    <form class="panel" id="create-sample-form" data-doc-id="${docTypeId}">
      <div class="form-grid">
        <div class="form-field">
          <label>Tên file (giả lập)</label>
          <input name="fileName" placeholder="sample_demo.jpg" required />
        </div>
        <div class="form-field">
          <label>Người upload</label>
          <input name="uploadedBy" placeholder="ten.nguoidung" />
        </div>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Tạo sample</button>
        <button class="button secondary" type="button" data-action="cancel-create-sample">Hủy</button>
      </div>
    </form>
  `;
}

function renderDocTypeTemplates(docType, extra) {
  const docTypeId = getValue(docType, 'Id');
  const templates = getValue(docType, 'Templates') || [];
  const selectedId = extra && extra[0] ? Number(extra[0]) : (templates[0] ? getValue(templates[0], 'Id') : null);

  const rows = templates
    .map((tpl) => {
      const id = getValue(tpl, 'Id');
      const version = getValue(tpl, 'Version');
      const description = getValue(tpl, 'Description');
      const updatedAt = formatDateTime(getValue(tpl, 'UpdatedAt'));
      const isActive = getValue(tpl, 'IsActive');
      const lastTest = getValue(tpl, 'LastTest');
      return `
        <tr>
          <td><strong>${escapeHtml(version)}</strong><div class="inline-hint">${escapeHtml(description || '')}</div></td>
          <td>${updatedAt}</td>
          <td>${isActive ? '<span class="badge success">Active</span>' : '<span class="badge-outline">Inactive</span>'}</td>
          <td>${lastTest ? escapeHtml(getValue(lastTest, 'Summary')) : '<span class="inline-hint">Chưa test</span>'}</td>
          <td><a class="button secondary" href="#/doc-types/${docTypeId}/templates/${id}">Chỉnh sửa</a></td>
        </tr>
      `;
    })
    .join('');

  const selectedTemplate = templates.find((tpl) => getValue(tpl, 'Id') === selectedId);
  const editor = selectedTemplate ? renderTemplateEditor(docType, selectedTemplate) : '<div class="empty-state">Chọn một template để chỉnh sửa.</div>';
  const createForm = uiState.newTemplateFor === docTypeId ? renderTemplateCreateForm(docTypeId) : '';

  return `
    <div class="panel">
      <div class="flex-between">
        <h3>Templates (${templates.length})</h3>
        <button class="button" type="button" data-action="toggle-create-template" data-id="${docTypeId}">+ Template mới</button>
      </div>
      ${createForm}
      ${templates.length ? `
        <div class="table-wrapper">
          <table data-enhance="datatable" data-table-key="doc-type-templates-${docTypeId}">
            <thead>
              <tr>
                <th>Phiên bản</th>
                <th>Cập nhật</th>
                <th>Trạng thái</th>
                <th>Kết quả test</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      ` : '<div class="empty-state">Chưa có template nào.</div>'}
    </div>
    ${editor}
  `;
}

function renderTemplateCreateForm(docTypeId) {
  return `
    <form class="panel template-editor" id="create-template-form" data-doc-id="${docTypeId}">
      <h3>Template mới</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>Phiên bản</label>
          <input name="version" placeholder="v1.2" />
        </div>
        <div class="form-field">
          <label>Mô tả</label>
          <input name="description" placeholder="Ghi chú" />
        </div>
        <div class="form-field">
          <label>Trạng thái</label>
          <select name="isActive">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>
      <div class="form-field">
        <label>Anchors JSON</label>
        <textarea name="anchorsJson" class="small">{"header":"ANCHOR"}</textarea>
      </div>
      <div class="form-field">
        <label>Fields JSON</label>
        <textarea name="fieldsJson" class="small">{"id":{"regex":"[0-9]{12}"}}</textarea>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Tạo template</button>
        <button class="button secondary" type="button" data-action="cancel-create-template">Hủy</button>
      </div>
    </form>
  `;
}
function renderTemplateEditor(docType, template) {
  const docTypeId = getValue(docType, 'Id');
  const templateId = getValue(template, 'Id');
  const samples = getValue(docType, 'Samples') || [];
  const lastTest = getValue(template, 'LastTest');
  const testSampleId = uiState.templateTestSelection[templateId] || (lastTest ? getValue(lastTest, 'SampleId') : (samples[0] ? getValue(samples[0], 'Id') : null));

  const sampleOptions = samples
    .map((sample) => {
      const id = getValue(sample, 'Id');
      const label = `${getValue(sample, 'FileName')} · ${getValue(sample, 'Status')}`;
      return `<option value="${id}" ${id === testSampleId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');

  return `
    <form class="panel template-editor" id="template-edit-form" data-template-id="${templateId}" data-doc-id="${docTypeId}">
      <h3>Chỉnh sửa template ${escapeHtml(getValue(template, 'Version'))}</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>Phiên bản</label>
          <input name="version" value="${escapeAttribute(getValue(template, 'Version'))}" />
        </div>
        <div class="form-field">
          <label>Mô tả</label>
          <input name="description" value="${escapeAttribute(getValue(template, 'Description') || '')}" />
        </div>
        <div class="form-field">
          <label>Trạng thái</label>
          <select name="isActive">
            <option value="true" ${getValue(template, 'IsActive') ? 'selected' : ''}>Active</option>
            <option value="false" ${getValue(template, 'IsActive') ? '' : 'selected'}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="form-field">
        <label>Anchors JSON</label>
        <textarea name="anchorsJson" class="small">${escapeHtml(getValue(template, 'AnchorsJson') || '{}')}</textarea>
      </div>
      <div class="form-field">
        <label>Fields JSON</label>
        <textarea name="fieldsJson" class="small">${escapeHtml(getValue(template, 'FieldsJson') || '{}')}</textarea>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Lưu template</button>
        ${samples.length ? `
          <div class="form-field" style="margin:0">
            <label>Test trên sample</label>
            <select name="testSampleId">
              ${sampleOptions}
            </select>
          </div>
          <button class="button secondary" type="button" id="run-template-test">Chạy test</button>
        ` : '<span class="inline-hint">Cần tối thiểu một sample để test template.</span>'}
      </div>
      ${lastTest ? `
        <div class="panel" style="margin-top:16px">
          <h4>Kết quả test gần nhất</h4>
          <p>${escapeHtml(getValue(lastTest, 'Summary') || '')}</p>
          <p class="inline-hint">Mẫu: ${escapeHtml(getValue(lastTest, 'SampleFileName') || '')} · ${formatDateTime(getValue(lastTest, 'TestedAt'))}</p>
          <pre>${escapeHtml(JSON.stringify(getValue(lastTest, 'Fields') || {}, null, 2))}</pre>
        </div>
      ` : '<div class="inline-hint">Chưa có kết quả test nào.</div>'}
    </form>
  `;
}

function renderDocTypeSamplers(docType) {
  const docTypeId = getValue(docType, 'Id');
  const samplers = getValue(docType, 'Samplers') || [];
  const createForm = uiState.newSamplerFor === docTypeId ? renderSamplerCreateForm(docTypeId) : '';

  const forms = samplers
    .map((sampler) => {
      const samplerId = getValue(sampler, 'Id');
      const code = getValue(sampler, 'Code');
      const name = getValue(sampler, 'Name');
      const description = getValue(sampler, 'Description');
      const fields = (getValue(sampler, 'Fields') || []).join(', ');
      const isActive = getValue(sampler, 'IsActive');
      const updatedAt = formatDateTime(getValue(sampler, 'UpdatedAt'));
      return `
        <form class="panel" data-sampler-id="${samplerId}" data-doc-id="${docTypeId}">
          <h3>${escapeHtml(name)}</h3>
          <div class="form-grid">
            <div class="form-field">
              <label>Mã sampler</label>
              <input name="code" value="${escapeAttribute(code)}" disabled />
            </div>
            <div class="form-field">
              <label>Tên hiển thị</label>
              <input name="name" value="${escapeAttribute(name)}" />
            </div>
            <div class="form-field">
              <label>Trạng thái</label>
              <select name="isActive">
                <option value="true" ${isActive ? 'selected' : ''}>Active</option>
                <option value="false" ${isActive ? '' : 'selected'}>Inactive</option>
              </select>
            </div>
          </div>
          <div class="form-field">
            <label>Mô tả</label>
            <textarea name="description" class="small">${escapeHtml(description || '')}</textarea>
          </div>
          <div class="form-field">
            <label>Các trường (phân tách bởi dấu phẩy)</label>
            <input name="fields" value="${escapeAttribute(fields)}" placeholder="id, name, dob" />
          </div>
          <div class="form-actions">
            <button class="button" type="submit">Lưu sampler</button>
            <span class="inline-hint">Cập nhật: ${updatedAt}</span>
          </div>
        </form>
      `;
    })
    .join('');

  return `
    <div class="panel">
      <div class="flex-between">
        <h3>Samplers (${samplers.length})</h3>
        <button class="button" type="button" data-action="toggle-create-sampler" data-id="${docTypeId}">+ Sampler mới</button>
      </div>
      ${createForm}
      <div class="history-list">
        ${forms || '<div class="empty-state">Chưa có sampler nào.</div>'}
      </div>
    </div>
  `;
}

function renderSamplerCreateForm(docTypeId) {
  return `
    <form class="panel" id="create-sampler-form" data-doc-id="${docTypeId}">
      <h3>Sampler mới</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>Mã sampler</label>
          <input name="code" placeholder="VD: CCCD_CORE" />
        </div>
        <div class="form-field">
          <label>Tên hiển thị</label>
          <input name="name" placeholder="Tên sampler" required />
        </div>
        <div class="form-field">
          <label>Trạng thái</label>
          <select name="isActive">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>
      <div class="form-field">
        <label>Mô tả</label>
        <textarea name="description" class="small" placeholder="Mục đích sử dụng"></textarea>
      </div>
      <div class="form-field">
        <label>Các trường (phân tách bởi dấu phẩy)</label>
        <input name="fields" placeholder="id, name, dob" />
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Tạo sampler</button>
        <button class="button secondary" type="button" data-action="cancel-create-sampler">Hủy</button>
      </div>
    </form>
  `;
}

function renderDocTypeTraining(docType) {
  const docTypeId = getValue(docType, 'Id');
  const dataset = getValue(docType, 'Dataset') || {};
  const samples = getValue(docType, 'Samples') || [];
  const labeled = dataset.Labeled ?? samples.filter((s) => getValue(s, 'IsLabeled')).length;
  const verified = dataset.Verified ?? samples.filter((s) => getValue(s, 'IsVerified')).length;
  const trainingReady = dataset.Training ?? samples.filter((s) => getValue(s, 'IncludedInTraining')).length;
  const averageAccuracy = formatAccuracy(getValue(dataset, 'AverageAccuracy'));
  const selectedScope = uiState.trainingScope[docTypeId] || 'verified';
  const jobs = getValue(docType, 'TrainingJobs') || [];
  const history = jobs
    .map((job) => {
      const datasetSummary = getValue(job, 'DatasetSummary');
      const improvement = getValue(job, 'BaselineAccuracy') && getValue(job, 'ImprovedAccuracy')
        ? `${formatAccuracy(getValue(job, 'BaselineAccuracy'))} → ${formatAccuracy(getValue(job, 'ImprovedAccuracy'))}`
        : '';
      return `
        <div class="history-item">
          <h4>${escapeHtml(getValue(job, 'Mode'))} · ${escapeHtml(getValue(job, 'Status'))}</h4>
          <time>Bắt đầu: ${formatDateTime(getValue(job, 'CreatedAt'))}</time><br/>
          <time>Hoàn tất: ${formatDateTime(getValue(job, 'CompletedAt'))}</time>
          <p>${escapeHtml(getValue(job, 'Summary') || '')}</p>
          ${datasetSummary ? `<p class="inline-hint">Dataset: ${escapeHtml(datasetSummary)}</p>` : ''}
          ${improvement ? `<p class="inline-hint">Accuracy: ${improvement}</p>` : ''}
        </div>
      `;
    })
    .join('');

  return `
    <form class="panel" id="train-form" data-doc-id="${docTypeId}">
      <h3>Kích hoạt huấn luyện</h3>
      <div class="form-grid">
        <div class="form-field">
          <label>Chế độ</label>
          <select name="mode">
            <option value="FAST">FAST</option>
            <option value="ENHANCED">ENHANCED</option>
          </select>
        </div>
        <div class="form-field">
          <label>Tập dữ liệu</label>
          <select name="datasetScope">
            <option value="verified" ${selectedScope === 'verified' ? 'selected' : ''}>Chỉ mẫu đã verify (${verified})</option>
            <option value="all" ${selectedScope === 'all' ? 'selected' : ''}>Toàn bộ mẫu gán nhãn (${labeled})</option>
            <option value="latest" ${selectedScope === 'latest' ? 'selected' : ''}>10 mẫu mới nhất</option>
          </select>
          <span class="inline-hint">Chỉ những tài liệu đã gán nhãn mới được sử dụng khi huấn luyện.</span>
        </div>
        <div class="form-field">
          <label>Ghi chú</label>
          <textarea name="notes" class="small" placeholder="Mô tả kỳ vọng, ví dụ: Tối ưu whitelist"></textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Chạy huấn luyện</button>
      </div>
      <div class="meta-block">
        <span>Tổng gán nhãn: ${labeled}</span>
        <span>Verify: ${verified}</span>
        <span>Đang huấn luyện: ${trainingReady}</span>
        <span>Accuracy hiện tại: ${averageAccuracy}</span>
      </div>
    </form>
    <div class="panel">
      <h3>Lịch sử huấn luyện</h3>
      <div class="history-list">
        ${history || '<div class="empty-state">Chưa có lịch sử huấn luyện.</div>'}
      </div>
    </div>
  `;
}

function renderSampleDetail(sample) {
  const sampleId = getValue(sample, 'Id');
  const docTypeId = getValue(sample, 'DocumentTypeId');
  const docType = state.docTypeDetails[docTypeId] || state.docTypes.find((dt) => getValue(dt, 'Id') === docTypeId) || null;
  const docName = docType ? getValue(docType, 'Name') : 'Không xác định';
  const previewUrl = getValue(sample, 'PreviewUrl');
  const status = getValue(sample, 'Status');
  const isLabeled = getValue(sample, 'IsLabeled');
  const isVerified = getValue(sample, 'IsVerified');
  const includedInTraining = getValue(sample, 'IncludedInTraining');
  const accuracy = formatAccuracy(getValue(sample, 'Accuracy'));
  const uploadedAt = formatDateTime(getValue(sample, 'UploadedAt'));
  const updatedAt = formatDateTime(getValue(sample, 'UpdatedAt') || getValue(sample, 'UploadedAt'));
  const ocrPreview = getValue(sample, 'OcrPreview') || '';
  const labeledText = getValue(sample, 'LabeledText') || '';
  const notes = getValue(sample, 'Notes') || '';
  const suggested = getValue(sample, 'SuggestedFields');
  const lastOutput = getValue(sample, 'LastOcrOutput');
  const comparisons = getValue(sample, 'ComparisonHistory') || [];

  return `
    <div class="main-header">
      <div>
        <h2>${escapeHtml(getValue(sample, 'FileName'))}</h2>
        <p class="inline-hint">DocType: ${escapeHtml(docName)} · ID: ${docTypeId}</p>
      </div>
      <div class="actions">
        <a class="button secondary" href="#/doc-types/${docTypeId}/dataset">Quay lại tập dữ liệu</a>
      </div>
    </div>
    <div class="panel sample-preview">
      <div>
        ${previewUrl ? `<img src="${previewUrl}" alt="Preview" />` : '<div class="empty-state">Không có preview</div>'}
        <div class="meta-block">
          <span>Trạng thái: ${escapeHtml(status)}</span>
          <span>${isLabeled ? '<span class="badge success">Đã gán nhãn</span>' : '<span class="badge danger">Chưa gán nhãn</span>'}</span>
          <span>${isVerified ? '<span class="badge success">Đã verify</span>' : '<span class="badge danger">Chưa verify</span>'}</span>
          <span>${includedInTraining ? '<span class="badge">Trong tập train</span>' : '<span class="badge-outline">Ngoài tập train</span>'}</span>
          <span>Upload: ${uploadedAt}</span>
          <span>Cập nhật: ${updatedAt}</span>
          <span>Accuracy: ${accuracy}</span>
        </div>
      </div>
      <div>
        <h3>OCR thô</h3>
        <pre>${escapeHtml(ocrPreview)}</pre>
      </div>
    </div>
    ${lastOutput ? `
      <div class="panel">
        <h3>Output OCR được sử dụng so sánh</h3>
        <pre>${escapeHtml(JSON.stringify(lastOutput, null, 2))}</pre>
      </div>
    ` : ''}
    ${suggested ? `
      <div class="panel">
        <h3>Gợi ý trường từ OCR</h3>
        <pre>${escapeHtml(JSON.stringify(suggested, null, 2))}</pre>
        <button class="button secondary" type="button" id="apply-suggestion">Áp dụng gợi ý</button>
      </div>
    ` : ''}
    ${comparisons.length ? `
      <div class="panel">
        <h3>Lịch sử so sánh</h3>
        <div class="history-list">
          ${comparisons
            .map((entry) => `
              <div class="history-item">
                <h4>${formatAccuracy(getValue(entry, 'Accuracy'))}</h4>
                <p>${escapeHtml(getValue(entry, 'Notes') || '')}</p>
                <time>${formatDateTime(getValue(entry, 'ComparedAt'))}</time>
              </div>
            `)
            .join('')}
        </div>
      </div>
    ` : ''}
    <form class="panel" id="label-form" data-sample-id="${sampleId}" data-doc-id="${docTypeId}">
      <h3>Gán nhãn mẫu</h3>
      <div class="form-field inline-toggles">
        <label class="checkbox-row">
          <input type="checkbox" name="isVerified" ${isVerified ? 'checked' : ''} />
          Đã xác minh output
        </label>
        <label class="checkbox-row">
          <input type="checkbox" name="includeInTraining" ${includedInTraining ? 'checked' : ''} ${isLabeled ? '' : 'disabled'} />
          Dùng cho huấn luyện
        </label>
        ${isLabeled ? '' : '<span class="inline-hint">Cần gán nhãn để thêm vào tập train</span>'}
      </div>
      <div class="form-field">
        <label>Full text chuẩn hóa</label>
        <textarea name="labeledText" class="small" placeholder="Nhập full text chuẩn hóa...">${escapeHtml(labeledText)}</textarea>
      </div>
      <div class="form-field">
        <label>Trường dữ liệu</label>
        <div id="fields-container"></div>
        <button class="button secondary" type="button" id="add-field">+ Thêm trường</button>
      </div>
      <div class="form-field">
        <label>Ghi chú</label>
        <textarea name="notes" class="small" placeholder="Ghi chú nội bộ">${escapeHtml(notes)}</textarea>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Lưu nhãn</button>
      </div>
    </form>
  `;
}
function bindSidebarEvents() {
  if (sidebarEventsBound) {
    return;
  }

  const createBtn = document.getElementById('sidebar-create-doc-type');
  if (createBtn) {
    createBtn.addEventListener('click', (event) => {
      event.preventDefault();
      navigateTo('#/doc-types/new');
    });
    sidebarEventsBound = true;
  }
}

function bindContentEvents(segments) {
  if (segments[0] === 'doc-types') {
    if (segments[1] === 'new') {
      bindDocTypeCreateEvents();
      return;
    }

    if (!segments[1]) {
      bindDocTypeListEvents();
      return;
    }

    const docTypeId = Number(segments[1]);
    const tab = normalizeDocTypeTab(segments[2]);
    switch (tab) {
      case 'dataset':
        bindDocTypeDatasetEvents(docTypeId);
        break;
      case 'templates':
        bindDocTypeTemplatesEvents(docTypeId);
        break;
      case 'samplers':
        bindDocTypeSamplersEvents(docTypeId);
        break;
      case 'training':
        bindDocTypeTrainingEvents(docTypeId);
        break;
      case 'configuration':
      default:
        bindDocTypeConfigurationEvents(docTypeId);
        break;
    }
    return;
  }

  if (segments[0] === 'datasets') {
    bindDatasetExplorerEvents();
    return;
  }

  if (segments[0] === 'training') {
    bindTrainingHubEvents();
    return;
  }

  if (segments[0] === 'samples' && segments[1]) {
    const sampleId = Number(segments[1]);
    bindSampleDetailEvents(sampleId);
  }
}

function bindDocTypeListEvents() {
  const openBtn = document.getElementById('open-create-doc-type');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      navigateTo('#/doc-types/new');
    });
  }

  document.querySelectorAll('button[data-action="view-doc"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      if (!Number.isNaN(id)) {
        navigateTo(`#/doc-types/${id}/configuration`);
      }
    });
  });
}

function bindDocTypeCreateEvents() {
  const backBtn = document.getElementById('back-to-doc-type-list');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      navigateTo('#/doc-types');
    });
  }

  const form = document.getElementById('create-doc-type-form');
  if (!form) {
    return;
  }

  const cancelBtn = document.getElementById('cancel-create-doc-type');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      navigateTo('#/doc-types');
    });
  }

  const sampleInput = form.querySelector('input[name="sampleFiles"]');
  const sampleList = form.querySelector('[data-role="sample-file-list"]');

  if (sampleInput && sampleList) {
    const renderSelectedFiles = () => {
      const files = Array.from(sampleInput.files || []).filter((file) => file && file.name);
      if (!files.length) {
        sampleList.innerHTML = '<li>Chưa chọn tài liệu nào</li>';
        sampleList.classList.add('empty');
        return;
      }

      sampleList.innerHTML = files.map((file) => `<li>${escapeHtml(file.name)}</li>`).join('');
      sampleList.classList.remove('empty');
    };

    renderSelectedFiles();
    sampleInput.addEventListener('change', renderSelectedFiles);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      code: form.code.value.trim(),
      name: form.name.value.trim(),
      preferredMode: form.preferredMode.value,
      description: form.description.value.trim() || null,
      schemaJson: form.schemaJson.value.trim() || null,
      ocrConfigJson: form.ocrConfigJson.value.trim() || null
    };

    const selectedFiles = sampleInput
      ? Array.from(sampleInput.files || []).filter((file) => file && file.name)
      : [];
    const uploadedBy = form.sampleUploadedBy ? form.sampleUploadedBy.value.trim() : '';

    try {
      const created = await fetchJson(`${API_BASE}/doc-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let message = 'Đã tạo loại tài liệu mới';
      const newId = Number(getValue(created, 'Id'));
      if (Number.isNaN(newId)) {
        await loadDocTypeSummaries();
        showToast(message);
        navigateTo('#/doc-types');
        return;
      }

      state.docTypeDetails[newId] = created;

      if (selectedFiles.length) {
        const countLabel = selectedFiles.length === 1 ? '1 tài liệu mẫu' : `${selectedFiles.length} tài liệu mẫu`;
        try {
          await uploadSampleFilesForDocType(newId, selectedFiles, uploadedBy);
          const refreshed = await ensureDocTypeDetail(newId, { force: true });
          if (refreshed) {
            state.docTypeDetails[newId] = refreshed;
          }
          message = `Đã tạo loại tài liệu mới và thêm ${countLabel}`;
        } catch (uploadError) {
          console.error(uploadError);
          await ensureDocTypeDetail(newId, { force: true });
          message = 'Đã tạo loại tài liệu mới nhưng upload tài liệu mẫu thất bại';
        }
      }

      await loadDocTypeSummaries();
      showToast(message);
      navigateTo(`#/doc-types/${newId}/configuration`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tạo docType');
    }
  });
}

function bindDocTypeConfigurationEvents(docTypeId) {
  const refreshBtn = document.getElementById('refresh-doc-type');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await ensureDocTypeDetail(docTypeId, { force: true });
      await loadDocTypeSummaries();
      showToast('Đã làm mới dữ liệu docType');
    });
  }

  const form = document.getElementById('doc-type-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: state.docTypeDetails[docTypeId]?.Code || state.docTypeDetails[docTypeId]?.code || '',
        name: form.name.value.trim(),
        description: form.description.value.trim() || null,
        preferredMode: form.preferredMode.value,
        schemaJson: form.schemaJson.value.trim() || null,
        ocrConfigJson: form.ocrConfigJson.value.trim() || null
      };

      try {
        const updated = await fetchJson(`${API_BASE}/doc-types/${docTypeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        state.docTypeDetails[docTypeId] = updated;
        await loadDocTypeSummaries();
        showToast('Đã lưu cấu hình docType');
        renderApp();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể cập nhật docType');
      }
    });
  }
}

function bindDocTypeDatasetEvents(docTypeId) {
  document.querySelectorAll('button[data-action="toggle-create-sample"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      uiState.sampleFormFor = uiState.sampleFormFor === id ? null : id;
      renderApp();
    });
  });

  const cancelBtn = document.querySelector('button[data-action="cancel-create-sample"]');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      uiState.sampleFormFor = null;
      renderApp();
    });
  }

  const form = document.getElementById('create-sample-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        fileName: form.fileName.value.trim(),
        uploadedBy: form.uploadedBy.value.trim() || 'admin'
      };

      try {
        await fetchJson(`${API_BASE}/doc-types/${docTypeId}/samples`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        uiState.sampleFormFor = null;
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast('Đã tạo sample giả lập');
        renderApp();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể tạo sample');
      }
    });
  }

  document.querySelectorAll('input[data-action="toggle-verify"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const sampleId = Number(input.dataset.id);
      const desired = input.checked;
      try {
        await fetchJson(`${API_BASE}/samples/${sampleId}/verify`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isVerified: desired })
        });
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast(desired ? 'Đã đánh dấu verify' : 'Đã bỏ đánh dấu verify');
      } catch (error) {
        input.checked = !desired;
        showToast(error instanceof Error ? error.message : 'Cập nhật verify thất bại');
      }
    });
  });

  document.querySelectorAll('input[data-action="toggle-training"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const sampleId = Number(input.dataset.id);
      const desired = input.checked;
      try {
        await fetchJson(`${API_BASE}/samples/${sampleId}/training`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includedInTraining: desired })
        });
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast(desired ? 'Đã thêm vào tập huấn luyện' : 'Đã loại khỏi tập huấn luyện');
      } catch (error) {
        input.checked = !desired;
        showToast(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái huấn luyện');
      }
    });
  });
}

function bindDocTypeTemplatesEvents(docTypeId) {
  document.querySelectorAll('button[data-action="toggle-create-template"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      uiState.newTemplateFor = uiState.newTemplateFor === id ? null : id;
      renderApp();
    });
  });

  const cancelBtn = document.querySelector('button[data-action="cancel-create-template"]');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      uiState.newTemplateFor = null;
      renderApp();
    });
  }

  const createForm = document.getElementById('create-template-form');
  if (createForm) {
    createForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        version: createForm.version.value.trim(),
        description: createForm.description.value.trim() || null,
        anchorsJson: createForm.anchorsJson.value,
        fieldsJson: createForm.fieldsJson.value,
        isActive: createForm.isActive.value === 'true'
      };

      try {
        const created = await fetchJson(`${API_BASE}/doc-types/${docTypeId}/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const newId = getValue(created, 'Id');
        uiState.newTemplateFor = null;
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast('Đã tạo template mới');
        navigateTo(`#/doc-types/${docTypeId}/templates/${newId}`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể tạo template');
      }
    });
  }

  const editForm = document.getElementById('template-edit-form');
  if (editForm) {
    const templateId = Number(editForm.dataset.templateId);
    const select = editForm.querySelector('select[name="testSampleId"]');
    if (select) {
      select.addEventListener('change', () => {
        uiState.templateTestSelection[templateId] = Number(select.value);
      });
    }

    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        version: editForm.version.value.trim(),
        description: editForm.description.value.trim() || null,
        anchorsJson: editForm.anchorsJson.value,
        fieldsJson: editForm.fieldsJson.value,
        isActive: editForm.isActive.value === 'true'
      };

      try {
        await fetchJson(`${API_BASE}/templates/${templateId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast('Đã lưu template');
        renderApp();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể cập nhật template');
      }
    });

    const testBtn = document.getElementById('run-template-test');
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        const sampleId = Number(editForm.testSampleId.value);
        if (!sampleId) {
          showToast('Chọn sample để test');
          return;
        }

        try {
          await fetchJson(`${API_BASE}/doc-types/${docTypeId}/templates/${templateId}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sampleId })
          });
          await ensureDocTypeDetail(docTypeId, { force: true });
          showToast('Đã test template');
          renderApp();
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Test template thất bại');
        }
      });
    }
  }
}

function bindDocTypeSamplersEvents(docTypeId) {
  document.querySelectorAll('button[data-action="toggle-create-sampler"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      uiState.newSamplerFor = uiState.newSamplerFor === id ? null : id;
      renderApp();
    });
  });

  const cancelBtn = document.querySelector('button[data-action="cancel-create-sampler"]');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      uiState.newSamplerFor = null;
      renderApp();
    });
  }

  const createForm = document.getElementById('create-sampler-form');
  if (createForm) {
    createForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: createForm.code.value.trim(),
        name: createForm.name.value.trim(),
        description: createForm.description.value.trim() || null,
        fields: createForm.fields.value.split(',').map((v) => v.trim()).filter(Boolean),
        isActive: createForm.isActive.value === 'true'
      };

      try {
        await fetchJson(`${API_BASE}/doc-types/${docTypeId}/samplers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        uiState.newSamplerFor = null;
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast('Đã tạo sampler mới');
        renderApp();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể tạo sampler');
      }
    });
  }

  document.querySelectorAll('form[data-sampler-id]').forEach((form) => {
    const samplerId = Number(form.dataset.samplerId);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        name: form.name.value.trim(),
        description: form.description.value.trim() || null,
        fields: form.fields.value.split(',').map((v) => v.trim()).filter(Boolean),
        isActive: form.isActive.value === 'true'
      };

      try {
        await fetchJson(`${API_BASE}/samplers/${samplerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast('Đã lưu sampler');
        renderApp();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể cập nhật sampler');
      }
    });
  });
}

function bindDocTypeTrainingEvents(docTypeId) {
  const form = document.getElementById('train-form');
  if (form) {
    const scopeSelect = form.querySelector('select[name="datasetScope"]');
    if (scopeSelect) {
      scopeSelect.value = uiState.trainingScope[docTypeId] || scopeSelect.value || 'verified';
      scopeSelect.addEventListener('change', () => {
        uiState.trainingScope[docTypeId] = scopeSelect.value;
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        mode: form.mode.value,
        notes: form.notes.value.trim() || null,
        datasetScope: scopeSelect ? scopeSelect.value : 'verified'
      };

      try {
        await fetchJson(`${API_BASE}/doc-types/${docTypeId}/train`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast('Đã ghi nhận phiên huấn luyện giả lập');
        renderApp();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể kích hoạt huấn luyện');
      }
    });
  }
}

function bindSampleDetailEvents(sampleId) {
  const sample = state.sampleCache[sampleId] || findSample(sampleId);
  if (!sample) {
    return;
  }

  const container = document.getElementById('fields-container');
  if (container) {
    populateFieldRows(container, sample);

    container.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLButtonElement && target.dataset.action === 'remove-field') {
        event.preventDefault();
        target.parentElement?.remove();
      }
    });
  }

  const addFieldBtn = document.getElementById('add-field');
  if (addFieldBtn && container) {
    addFieldBtn.addEventListener('click', (event) => {
      event.preventDefault();
      appendFieldRow(container, '', '');
    });
  }

  const applySuggestionBtn = document.getElementById('apply-suggestion');
  if (applySuggestionBtn && container) {
    applySuggestionBtn.addEventListener('click', (event) => {
      event.preventDefault();
      const suggestion = getValue(sample, 'SuggestedFields') || {};
      populateFieldRows(container, sample, suggestion);
      showToast('Đã áp dụng gợi ý OCR');
    });
  }

  const form = document.getElementById('label-form');
  if (form && container) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const verifiedInput = form.querySelector('input[name="isVerified"]');
      const trainingInput = form.querySelector('input[name="includeInTraining"]');
      const fields = {};
      container.querySelectorAll('.field-row').forEach((row) => {
        const keyInput = row.querySelector('input[name="field-key"]');
        const valueInput = row.querySelector('input[name="field-value"]');
        const key = keyInput?.value.trim();
        const value = valueInput?.value.trim();
        if (key) {
          fields[key] = value || '';
        }
      });

      const payload = {
        labeledText: form.labeledText.value.trim() || null,
        notes: form.notes.value.trim() || null,
        fields,
        isVerified: verifiedInput ? verifiedInput.checked : undefined,
        includeInTraining: trainingInput && !trainingInput.disabled ? trainingInput.checked : undefined
      };

      const docTypeId = Number(form.dataset.docId);

      try {
        const updated = await fetchJson(`${API_BASE}/samples/${sampleId}/label`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        state.sampleCache[sampleId] = updated;
        await ensureDocTypeDetail(docTypeId, { force: true });
        await loadDocTypeSummaries();
        showToast('Đã lưu nhãn sample');
        renderApp();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể lưu nhãn');
      }
    });
  }
}

function navigateTo(hash) {
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    renderApp();
  }
}

function parseHash() {
  const hash = window.location.hash || '';
  return hash.replace(/^#/, '').split('/').filter(Boolean);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
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
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function formatAccuracy(value) {
  if (value === null || value === undefined) {
    return '—';
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return '—';
  }
  return `${number.toFixed(1)}%`;
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function findSample(sampleId) {
  for (const doc of Object.values(state.docTypeDetails)) {
    const samples = getValue(doc, 'Samples') || [];
    const found = samples.find((sample) => getValue(sample, 'Id') === sampleId);
    if (found) {
      return found;
    }
  }
  return null;
}

function showToast(message) {
  state.toast = message;
  renderApp();
  setTimeout(() => {
    if (state.toast === message) {
      state.toast = null;
      renderApp();
    }
  }, 3600);
}

function appendFieldRow(container, key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'field-row';

  const keyInput = document.createElement('input');
  keyInput.name = 'field-key';
  keyInput.placeholder = 'Tên trường (vd: id)';
  keyInput.value = key;

  const valueInput = document.createElement('input');
  valueInput.name = 'field-value';
  valueInput.placeholder = 'Giá trị';
  valueInput.value = value;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'button secondary';
  removeBtn.dataset.action = 'remove-field';
  removeBtn.textContent = 'Xóa';

  row.append(keyInput, valueInput, removeBtn);
  container.append(row);
}

function populateFieldRows(container, sample, override) {
  const source = override || getValue(sample, 'Fields') || {};
  container.innerHTML = '';
  const entries = Object.entries(source);
  if (entries.length === 0) {
    appendFieldRow(container, '', '');
    return;
  }

  entries.forEach(([key, value]) => appendFieldRow(container, key, value));
}
