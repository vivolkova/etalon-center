// Админка: управление услугами

// ── SERVICES MANAGEMENT ────────────────────────────────────────────

function renderAdminServices() {
  const grid = document.getElementById('services-edit-grid');
  grid.innerHTML = SERVICES.map((s, i) => `
<div class="svc-edit-card">
  <div class="se-header">
    <div class="se-icon" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--surface);border-radius:10px">${s.icon}</div>
    <div class="se-actions">
      <button class="action-btn confirm" style="font-size:11px;padding:4px 8px" onclick="openServiceModal(${i})">Ред.</button>
      <button class="action-btn cancel" style="font-size:11px;padding:4px 8px" onclick="deleteService(${i})">Уд.</button>
    </div>
  </div>
  <div class="se-name">${s.name}</div>
  <div class="se-desc">${s.desc}</div>
  <div class="se-price">${s.price}</div>
</div>`).join('');
}

function openServiceModal(idx) {
  document.getElementById('service-modal-title').textContent = idx === null ? 'Добавить услугу' : 'Редактировать услугу';
  document.getElementById('svcm-idx').value = idx === null ? '' : idx;
  if (idx !== null && idx !== undefined) {
    const s = SERVICES[idx];
    document.getElementById('svcm-icon').value = s.icon;
    document.getElementById('svcm-name').value = s.name;
    document.getElementById('svcm-desc').value = s.desc;
    document.getElementById('svcm-price').value = s.price;
    document.getElementById('svcm-feat').value = (s.features || []).join('\n');
  } else {
    ['svcm-icon', 'svcm-name', 'svcm-desc', 'svcm-price', 'svcm-feat'].forEach(id => document.getElementById(id).value = '');
  }
  document.getElementById('service-modal').classList.add('show');
}
function closeServiceModal() { document.getElementById('service-modal').classList.remove('show'); }

async function saveService() {
  const name = document.getElementById('svcm-name').value.trim();
  if (!name) { showToast('Введите название услуги', 'error'); return; }
  const data = {
    icon: document.getElementById('svcm-icon').value || '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
    name,
    desc: document.getElementById('svcm-desc').value.trim(),
    price: document.getElementById('svcm-price').value.trim(),
    features: document.getElementById('svcm-feat').value.split('\n').map(x => x.trim()).filter(Boolean),
  };
  const idxVal = document.getElementById('svcm-idx').value;
  try {
    if (idxVal !== '') {
      const id = SERVICES[parseInt(idxVal)].id;
      await ServicesAPI.update({ id, ...data });
      showToast('Услуга обновлена', 'success');
    } else {
      await ServicesAPI.create(data);
      showToast('Услуга добавлена', 'success');
    }
    await loadServices();
  } catch (e) {
    return;   // ошибка показана в apiRequest; модалку оставляем открытой
  }
  closeServiceModal();
  renderAdminServices();
  renderServices();
}

async function deleteService(idx) {
  if (!confirm('Удалить эту услугу?')) return;
  const id = SERVICES[idx] && SERVICES[idx].id;
  try {
    if (id) await ServicesAPI.delete(id);
    await loadServices();
  } catch (e) {
    return;   // ошибка показана в apiRequest
  }
  renderAdminServices();
  renderServices();
  showToast('Услуга удалена');
}

