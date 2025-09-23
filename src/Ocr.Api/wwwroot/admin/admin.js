const API_BASE = '/api/mock';

const state = {
  docTypes: [],
  docTypeDetails: {},
  sampleCache: {},
  loading: false,
  toast: null
};

const uiState = {
  showCreateDocType: false,
  sampleFormFor: null,
  newTemplateFor: null,
  templateTestSelection: {},
  newSamplerFor: null
};

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

    if (segments[0] === 'doc-types' && segments[1]) {
      const docTypeId = Number(segments[1]);
      if (!Number.isNaN(docTypeId)) {
        await ensureDocTypeDetail(docTypeId);
      }
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

  const segments = parseHash();
  const sidebar = renderSidebar(segments);
  const mainContent = renderMainContent(segments);
  const toast = state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : '';

  root.innerHTML = `
    <div class="app-shell">
      ${sidebar}
      <main class="main">${mainContent}</main>
    </div>
    ${toast}
  `;

  bindSidebarEvents();
  bindContentEvents(segments);
}

function renderSidebar(segments) {
  const currentDocTypeId = segments[0] === 'doc-types' && segments[1] ? Number(segments[1]) : null;
  const docTypeLinks = state.docTypes
    .map((dt) => {
      const id = getValue(dt, 'Id');
      const name = getValue(dt, 'Name');
      const isActive = currentDocTypeId === id;
      return `<a href="#/doc-types/${id}/overview" class="${isActive ? 'active' : ''}">${escapeHtml(name)}</a>`;
    })
    .join('');

  return `
    <aside class="sidebar">
      <h1>OCR Suite Admin</h1>
      <nav>
        <a href="#/doc-types" class="${segments[0] === 'doc-types' && !segments[1] ? 'active' : ''}">Bảng điều khiển</a>
        <div class="section-title">Loại tài liệu</div>
        ${docTypeLinks || '<span class="inline-hint">Chưa có loại tài liệu</span>'}
        <button class="linklike" id="sidebar-create-doc-type">+ Thêm loại tài liệu</button>
      </nav>
    </aside>
  `;
}

function renderMainContent(segments) {
  if (state.loading && state.docTypes.length === 0) {
    return renderLoading('Đang tải dữ liệu mock...');
  }

  if (segments[0] === 'doc-types' && !segments[1]) {
    return renderDocTypeList();
  }

  if (segments[0] === 'doc-types' && segments[1]) {
    const docTypeId = Number(segments[1]);
    const docType = state.docTypeDetails[docTypeId];
    if (!docType) {
      return renderLoading('Đang tải chi tiết loại tài liệu...');
    }

    const tab = segments[2] || 'overview';
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
  const cards = state.docTypes.map((dt) => {
    const id = getValue(dt, 'Id');
    const code = getValue(dt, 'Code');
    const name = getValue(dt, 'Name');
    const preferredMode = getValue(dt, 'PreferredMode');
    const stats = getValue(dt, 'Stats') || {};
    const activeTemplate = getValue(dt, 'ActiveTemplate');
    const lastTraining = getValue(dt, 'LastTraining');
    const updatedAt = formatDateTime(getValue(dt, 'UpdatedAt'));

    return `
      <div class="panel">
        <div class="flex-between">
          <div>
            <h3>${escapeHtml(name)}</h3>
            <p class="inline-hint">Mã: ${escapeHtml(code)}</p>
          </div>
          <span class="mode-pill">${escapeHtml(preferredMode || 'AUTO')}</span>
        </div>
        <div class="meta-block">
          <span>${stats.Samples ?? 0} mẫu (${stats.Labeled ?? 0} đã gán nhãn)</span>
          <span>${stats.Templates ?? 0} template</span>
          <span>${stats.Samplers ?? 0} sampler</span>
        </div>
        ${activeTemplate ? `<span class="badge">Template active: ${escapeHtml(activeTemplate)}</span>` : ''}
        ${lastTraining ? `<p class="inline-hint">Huấn luyện gần nhất: ${formatDateTime(getValue(lastTraining, 'CompletedAt') || getValue(lastTraining, 'CreatedAt'))}</p>` : ''}
        <div class="form-actions">
          <a class="button" href="#/doc-types/${id}/overview">Quản lý</a>
          <button class="button secondary" type="button" data-action="view-doc" data-id="${id}">Xem chi tiết</button>
        </div>
        <p class="inline-hint">Cập nhật: ${updatedAt}</p>
      </div>
    `;
  });

  const createForm = uiState.showCreateDocType ? renderDocTypeCreateForm() : '';

  return `
    <div class="main-header">
      <h2>Quản lý loại tài liệu</h2>
      <div class="actions">
        <button class="button" id="open-create-doc-type">+ Tạo loại tài liệu</button>
      </div>
    </div>
    ${createForm}
    <div class="grid columns-2">
      ${cards.join('') || '<div class="empty-state">Chưa có loại tài liệu nào, hãy tạo mới.</div>'}
    </div>
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
      <div class="form-actions">
        <button class="button" type="submit">Tạo</button>
        <button class="button secondary" type="button" id="cancel-create-doc-type">Hủy</button>
      </div>
    </form>
  `;
}

function renderDocTypeDetail(docType, tab, extra) {
  const id = getValue(docType, 'Id');
  const name = getValue(docType, 'Name');
  const code = getValue(docType, 'Code');
  const preferredMode = getValue(docType, 'PreferredMode');
  const description = getValue(docType, 'Description');

  const tabs = [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'samples', label: 'Samples' },
    { key: 'templates', label: 'Templates' },
    { key: 'samplers', label: 'Samplers' },
    { key: 'training', label: 'Huấn luyện' }
  ];

  const tabNav = tabs
    .map((t) => `<a href="#/doc-types/${id}/${t.key}" class="${tab === t.key ? 'active' : ''}">${t.label}</a>`)
    .join('');

  let content = '';
  switch (tab) {
    case 'samples':
      content = renderDocTypeSamples(docType);
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
    case 'overview':
    default:
      content = renderDocTypeOverview(docType);
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
        <a class="button" href="#/doc-types/${id}/samples">Xem samples</a>
      </div>
    </div>
    <div class="alert-info">
      ${escapeHtml(description || 'Chưa có mô tả.')}<br/>
      <span class="inline-hint">Chọn tab để quản lý chi tiết: sample, template, sampler và huấn luyện.</span>
    </div>
    <div class="tab-nav">${tabNav}</div>
    ${content}
  `;
}

function renderDocTypeOverview(docType) {
  const schema = getValue(docType, 'SchemaJson');
  const ocrConfig = getValue(docType, 'OcrConfigJson');
  const createdAt = formatDateTime(getValue(docType, 'CreatedAt'));
  const updatedAt = formatDateTime(getValue(docType, 'UpdatedAt'));
  const samples = getValue(docType, 'Samples') || [];
  const labeled = samples.filter((s) => getValue(s, 'IsLabeled')).length;
  const templates = getValue(docType, 'Templates') || [];
  const samplers = getValue(docType, 'Samplers') || [];
  const lastTraining = (getValue(docType, 'TrainingJobs') || [])[0];

  return `
    <div class="grid columns-2">
      <div class="stat-card">
        <h4>Tổng số mẫu</h4>
        <strong>${samples.length}</strong>
        <span class="inline-hint">${labeled} mẫu đã gán nhãn</span>
      </div>
      <div class="stat-card">
        <h4>Templates & Samplers</h4>
        <strong>${templates.length} template</strong>
        <span class="inline-hint">${samplers.length} sampler khả dụng</span>
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
  `;
}
function renderLastTraining(job) {
  const summary = getValue(job, 'Summary');
  const created = formatDateTime(getValue(job, 'CreatedAt'));
  const completed = formatDateTime(getValue(job, 'CompletedAt'));
  const mode = getValue(job, 'Mode');
  return `
    <div class="panel">
      <h3>Huấn luyện gần nhất</h3>
      <p><span class="badge-outline">${escapeHtml(mode)}</span> · Bắt đầu: ${created}</p>
      <p class="inline-hint">Hoàn tất: ${completed}</p>
      <p>${escapeHtml(summary || '')}</p>
    </div>
  `;
}

function renderDocTypeSamples(docType) {
  const docTypeId = getValue(docType, 'Id');
  const samples = getValue(docType, 'Samples') || [];
  const rows = samples
    .map((sample) => {
      const id = getValue(sample, 'Id');
      const fileName = getValue(sample, 'FileName');
      const status = getValue(sample, 'Status');
      const isLabeled = getValue(sample, 'IsLabeled');
      const uploadedBy = getValue(sample, 'UploadedBy');
      const uploadedAt = formatDateTime(getValue(sample, 'UploadedAt'));
      const updatedAt = formatDateTime(getValue(sample, 'UpdatedAt') || getValue(sample, 'UploadedAt'));
      return `
        <tr>
          <td>
            <strong>${escapeHtml(fileName)}</strong>
            <div class="inline-hint">Upload bởi ${escapeHtml(uploadedBy)} · ${uploadedAt}</div>
          </td>
          <td>${escapeHtml(status)}</td>
          <td>${isLabeled ? '<span class="badge success">Đã gán nhãn</span>' : '<span class="badge danger">Chưa gán nhãn</span>'}</td>
          <td>${updatedAt}</td>
          <td><a class="button secondary" href="#/samples/${id}">Label</a></td>
        </tr>
      `;
    })
    .join('');

  const createForm = uiState.sampleFormFor === docTypeId ? renderSampleCreateForm(docTypeId) : '';

  return `
    <div class="panel">
      <div class="flex-between">
        <h3>Danh sách mẫu (${samples.length})</h3>
        <button class="button" type="button" data-action="toggle-create-sample" data-id="${docTypeId}">+ Thêm mẫu</button>
      </div>
      ${createForm}
      ${samples.length ? `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Tên file</th>
                <th>Trạng thái</th>
                <th>Label</th>
                <th>Cập nhật</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state">Chưa có mẫu nào, hãy thêm mẫu mới.</div>'}
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
          <table>
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
  const jobs = getValue(docType, 'TrainingJobs') || [];
  const history = jobs
    .map((job) => {
      return `
        <div class="history-item">
          <h4>${escapeHtml(getValue(job, 'Mode'))} · ${escapeHtml(getValue(job, 'Status'))}</h4>
          <time>Bắt đầu: ${formatDateTime(getValue(job, 'CreatedAt'))}</time><br/>
          <time>Hoàn tất: ${formatDateTime(getValue(job, 'CompletedAt'))}</time>
          <p>${escapeHtml(getValue(job, 'Summary') || '')}</p>
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
          <label>Ghi chú</label>
          <textarea name="notes" class="small" placeholder="Mô tả kỳ vọng, ví dụ: Tối ưu whitelist"></textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Chạy huấn luyện</button>
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
  const uploadedAt = formatDateTime(getValue(sample, 'UploadedAt'));
  const updatedAt = formatDateTime(getValue(sample, 'UpdatedAt') || getValue(sample, 'UploadedAt'));
  const ocrPreview = getValue(sample, 'OcrPreview') || '';
  const labeledText = getValue(sample, 'LabeledText') || '';
  const notes = getValue(sample, 'Notes') || '';
  const suggested = getValue(sample, 'SuggestedFields');

  return `
    <div class="main-header">
      <div>
        <h2>${escapeHtml(getValue(sample, 'FileName'))}</h2>
        <p class="inline-hint">DocType: ${escapeHtml(docName)} · ID: ${docTypeId}</p>
      </div>
      <div class="actions">
        <a class="button secondary" href="#/doc-types/${docTypeId}/samples">Quay lại samples</a>
      </div>
    </div>
    <div class="panel sample-preview">
      <div>
        ${previewUrl ? `<img src="${previewUrl}" alt="Preview" />` : '<div class="empty-state">Không có preview</div>'}
        <div class="meta-block">
          <span>Trạng thái: ${escapeHtml(status)}</span>
          <span>${isLabeled ? '<span class="badge success">Đã gán nhãn</span>' : '<span class="badge danger">Chưa gán nhãn</span>'}</span>
          <span>Upload: ${uploadedAt}</span>
          <span>Cập nhật: ${updatedAt}</span>
        </div>
      </div>
      <div>
        <h3>OCR thô</h3>
        <pre>${escapeHtml(ocrPreview)}</pre>
      </div>
    </div>
    ${suggested ? `
      <div class="panel">
        <h3>Gợi ý trường từ OCR</h3>
        <pre>${escapeHtml(JSON.stringify(suggested, null, 2))}</pre>
        <button class="button secondary" type="button" id="apply-suggestion">Áp dụng gợi ý</button>
      </div>
    ` : ''}
    <form class="panel" id="label-form" data-sample-id="${sampleId}" data-doc-id="${docTypeId}">
      <h3>Gán nhãn mẫu</h3>
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
  const createBtn = document.getElementById('sidebar-create-doc-type');
  if (createBtn) {
    createBtn.addEventListener('click', (event) => {
      event.preventDefault();
      uiState.showCreateDocType = true;
      navigateTo('#/doc-types');
    });
  }
}

function bindContentEvents(segments) {
  if (segments[0] === 'doc-types' && !segments[1]) {
    bindDocTypeListEvents();
    return;
  }

  if (segments[0] === 'doc-types' && segments[1]) {
    const docTypeId = Number(segments[1]);
    const tab = segments[2] || 'overview';
    switch (tab) {
      case 'samples':
        bindDocTypeSamplesEvents(docTypeId);
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
      case 'overview':
      default:
        bindDocTypeOverviewEvents(docTypeId);
        break;
    }
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
      uiState.showCreateDocType = !uiState.showCreateDocType;
      renderApp();
    });
  }

  const cancelBtn = document.getElementById('cancel-create-doc-type');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      uiState.showCreateDocType = false;
      renderApp();
    });
  }

  const form = document.getElementById('create-doc-type-form');
  if (form) {
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

      try {
        const created = await fetchJson(`${API_BASE}/doc-types`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const newId = getValue(created, 'Id');
        uiState.showCreateDocType = false;
        state.docTypeDetails[newId] = created;
        await loadDocTypeSummaries();
        showToast('Đã tạo loại tài liệu mới');
        navigateTo(`#/doc-types/${newId}/overview`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể tạo docType');
      }
    });
  }

  document.querySelectorAll('button[data-action="view-doc"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      if (!Number.isNaN(id)) {
        navigateTo(`#/doc-types/${id}/overview`);
      }
    });
  });
}

function bindDocTypeOverviewEvents(docTypeId) {
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

function bindDocTypeSamplesEvents(docTypeId) {
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
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        mode: form.mode.value,
        notes: form.notes.value.trim() || null
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
        fields
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
