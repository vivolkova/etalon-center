// Сайт: страница «Услуги»

// ═══ SERVICES ════════════════════════════════════════════════════

// Страница «Услуги» строится из данных: разделы — категории услуг из справочника (service_category),
// у которых в выбранном филиале есть записи библиотеки; карточки — эти записи (описание, длительность, цена).
// «Записаться» открывает окно записи (js/site/individual.js): специалист → дата → свободное время.
// Услуга, которую в филиале некому оказывать (нет специалиста с графиком), показывается без записи.
async function renderServices() {
  renderSchLoc();
  const box = document.getElementById('services-grid');
  const loc = schLoc();
  if (!box || !loc) return;
  const opts = await indLoadOptions(loc.id);
  if (!schLoc() || Number(schLoc().id) !== Number(loc.id)) return;   // пока грузили, филиал сменили
  const items = opts ? indSvcItems(loc.id) : [];
  if (!items.length) { box.innerHTML = '<div class="indp-empty">В этом филиале пока нет услуг.</div>'; return; }
  // Разделы — в порядке справочника; категории, которой в справочнике уже нет, — в конце
  const codes = ACTIVITY_CATS.map(c => c.code).filter(code => items.some(i => i.cat === code));
  items.forEach(i => { if (codes.indexOf(i.cat) < 0) codes.push(i.cat); });
  box.innerHTML = codes.map(code => `
<div class="svc-section cat-${code}">
  <h3 class="svc-section-title"><span class="svc-dot"></span>${escAttr(catName(code))}</h3>
  <div class="services-grid">${items.filter(i => i.cat === code).map(svcCardHtml).join('')}</div>
</div>`).join('');
}

function svcCardHtml(it) {
  let feats = [];
  if (it.details) { try { feats = Array.isArray(it.details) ? it.details : JSON.parse(it.details); } catch (e) { } }
  const specs = (it.specialists || []).map(s => s.full_name || s.name).join(', ');
  return `<div class="service-card svc-card">
  <div class="service-name">${escAttr(it.name)}</div>
  ${it.summary ? `<div class="service-desc">${escAttr(it.summary)}</div>` : ''}
  ${feats && feats.length ? `<ul class="svc-feats">${feats.map(f => `<li>${escAttr(String(f))}</li>`).join('')}</ul>` : ''}
  <div class="svc-foot">
    <div>
      <div class="service-price">${it.price.toLocaleString('ru')} ₽</div>
      <div class="svc-meta">${fmtDurShort(it.duration)}${specs ? ' · ' + escAttr(specs) : ''}</div>
    </div>
    ${it.bookable
      ? `<button class="btn-primary svc-book" onclick="openIndividual(${it.id})">Записаться</button>`
      : `<span class="svc-meta">Запись через администратора</span>`}
  </div>
</div>`;
}
