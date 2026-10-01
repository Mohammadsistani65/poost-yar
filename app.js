// ==================== پوست‌یار ====================
// طراح: محمد سیستانی
// نسخه با سیستم بازخورد و دیتاست
// =====================================================

let catalog = null;
let stream = null;
let currentFacing = 'user';
let lastResult = null;
let lastCanvas = null;
let feedbackGiven = false;

// بارگذاری کاتالوگ
async function loadCatalog() {
  try {
    const r = await fetch('products.json?v=' + Date.now());
    catalog = await r.json();
  } catch (e) {
    alert('کاتالوگ بارگذاری نشد. اینترنت را چک کنید.');
  }
}
loadCatalog();

// ==================== تب‌ها ====================
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    ['scan','packs','history','dataset'].forEach(t => {
      document.getElementById('tab-' + t).classList.toggle('hidden', t !== target);
    });
    if (target === 'history') renderHistory();
    if (target === 'packs') renderPacksTab();
    if (target === 'dataset') renderDataset();
  };
});

// ==================== ناوبری ====================
const formSection = document.getElementById('form-section');
const cameraSection = document.getElementById('camera-section');
const resultSection = document.getElementById('result-section');

document.getElementById('next-to-camera').onclick = () => {
  const area = document.getElementById('scan-area').value;
  const label = area === 'face' ? 'صورت' : 'مو و کف سر';
  document.getElementById('scan-area-label').textContent = label;
  document.getElementById('camera-hint').textContent = area === 'face'
    ? 'صورت را در نور مناسب و بدون آرایش مقابل دوربین قرار دهید.'
    : 'برای اسکن مو، از دوربین پشت استفاده کنید.';
  currentFacing = area === 'face' ? 'user' : 'environment';
  formSection.classList.add('hidden');
  cameraSection.classList.remove('hidden');
  startCamera();
};

document.getElementById('restart').onclick = () => {
  resultSection.classList.add('hidden');
  formSection.classList.remove('hidden');
  document.getElementById('retake').classList.add('hidden');
  document.getElementById('capture').classList.remove('hidden');
  document.getElementById('fb-correction').classList.add('hidden');
  feedbackGiven = false;
};

document.getElementById('retake').onclick = () => {
  resultSection.classList.add('hidden');
  cameraSection.classList.remove('hidden');
  document.getElementById('retake').classList.add('hidden');
  document.getElementById('capture').classList.remove('hidden');
  startCamera();
};

// ==================== دوربین ====================
async function startCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacing, width: { ideal: 720 }, height: { ideal: 960 } }
    });
    document.getElementById('video').srcObject = stream;
  } catch (e) {
    if (currentFacing === 'environment') { currentFacing = 'user'; return startCamera(); }
    alert('دسترسی به دوربین ممکن نشد.');
  }
}

document.getElementById('switch-camera').onclick = () => {
  currentFacing = currentFacing === 'user' ? 'environment' : 'user';
  startCamera();
};

// ==================== تحلیل ====================
document.getElementById('capture').onclick = async () => {
  const video = document.getElementById('video');
  if (!video.videoWidth) { alert('دوربین آماده نیست.'); return; }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  if (stream) stream.getTracks().forEach(t => t.stop());

  lastCanvas = canvas;
  const scanArea = document.getElementById('scan-area').value;
  const issues = analyzeImage(canvas, scanArea);
  const products = buildProducts(issues);
  const packs = buildPacks(issues);

  lastResult = { issues, products, packs, scanArea };
  feedbackGiven = false;
  showResults(issues, products, packs);

  cameraSection.classList.add('hidden');
  resultSection.classList.remove('hidden');
};

function analyzeImage(canvas, scanArea) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const d = ctx.getImageData(0, 0, w, h).data;

  const regions = {
    forehead: { x0: 0.3, x1: 0.7, y0: 0.10, y1: 0.25 },
    eyes:     { x0: 0.2, x1: 0.8, y0: 0.30, y1: 0.45 },
    nose:     { x0: 0.35, x1: 0.65, y0: 0.40, y1: 0.55 },
    cheeks:   { x0: 0.15, x1: 0.85, y0: 0.45, y1: 0.65 },
    chin:     { x0: 0.35, x1: 0.65, y0: 0.65, y1: 0.85 }
  };

  function rs(r) {
    const x0 = Math.floor(w * r.x0), x1 = Math.floor(w * r.x1);
    const y0 = Math.floor(h * r.y0), y1 = Math.floor(h * r.y1);
    let c = 0, red = 0, shine = 0, dark = 0, edge = 0, prev = -1, sumR = 0;
    for (let y = y0; y < y1; y += 4) {
      for (let x = x0; x < x1; x += 4) {
        const i = (y * w + x) * 4;
        const R = d[i], G = d[i+1], B = d[i+2];
        sumR += R; c++;
        if (R > 140 && (R - G) > 35 && (R - B) > 25) red++;
        const lum = 0.299*R + 0.587*G + 0.114*B;
        if (lum > 200) shine++;
        if (lum < 90) dark++;
        if (prev >= 0 && Math.abs(lum - prev) > 30) edge++;
        prev = lum;
      }
    }
    return { redness: red/c, shine: shine/c, darkness: dark/c, texture: edge/c, avgR: sumR/c };
  }

  const stats = {};
  for (const k in regions) stats[k] = rs(regions[k]);
  const total = { redness:0, shine:0, darkness:0, texture:0, avgR:0 };
  Object.values(stats).forEach(s => {
    total.redness += s.redness; total.shine += s.shine;
    total.darkness += s.darkness; total.texture += s.texture; total.avgR += s.avgR;
  });
  const n = Object.keys(stats).length;
  for (const k in total) total[k] /= n;

  const issues = [];

  if (scanArea === 'scalp') {
    if (total.shine > 0.20) issues.push({ key:'dandruff', title:'احتمال شوره یا چربی کف سر',
      severity: total.shine > 0.30 ? 'high' : 'medium', desc:'براقیت در کف سر مشاهده شد.' });
    if (total.texture > 0.28 || total.darkness > 0.25) issues.push({ key:'hairLoss', title:'احتمال ضعیف شدن فولیکول مو',
      severity: total.texture > 0.35 ? 'high' : 'medium', desc:'کاهش تراکم در ناحیه مو مشاهده شد.' });
    if (issues.length === 0) issues.push({ key:'hairLoss', title:'مو و کف سر سالم',
      severity:'low', desc:'مشکل حادی مشاهده نشد.' });
  } else {
    if (stats.forehead.texture > 0.28 || stats.eyes.texture > 0.28)
      issues.push({ key:'wrinkles', title:'احتمال چین و چروک',
        severity: stats.forehead.texture > 0.35 ? 'high' : 'medium',
        desc:'خطوط در پیشانی و اطراف چشم.' });
    if (stats.cheeks.darkness > 0.20 || stats.forehead.darkness > 0.20)
      issues.push({ key:'spots', title:'احتمال لک و تیرگی',
        severity: stats.cheeks.darkness > 0.30 ? 'high' : 'medium',
        desc:'تیرگی در گونه‌ها و پیشانی.' });
    if (stats.nose.shine > 0.22 || stats.forehead.shine > 0.22)
      issues.push({ key:'oily', title:'احتمال پوست چرب و منافذ باز',
        severity: stats.nose.shine > 0.32 ? 'high' : 'medium',
        desc:'براقیت در بینی و پیشانی.' });
    if (stats.cheeks.redness > 0.15 || stats.chin.redness > 0.15)
      issues.push({ key:'acne', title:'احتمال آکنه و التهاب',
        severity: stats.cheeks.redness > 0.25 ? 'high' : 'medium',
        desc:'قرمزی در گونه‌ها یا چانه.' });
    if (total.avgR < 120)
      issues.push({ key:'dry', title:'احتمال خشکی و کم‌آبی',
        severity: total.avgR < 100 ? 'high' : 'medium',
        desc:'کاهش رطوبت پوست.' });
    if (issues.length === 0) issues.push({ key:'dry', title:'پوست سالم و متعادل',
      severity:'low', desc:'مراقبت روزانه توصیه می‌شود.' });
  }
  return issues;
}

function buildProducts(issues) {
  if (!catalog) return [];
  const map = new Map();
  issues.forEach(i => {
    const it = catalog.issues[i.key];
    if (it) it.products.forEach(p => map.set(p.brand + '|' + p.name, p));
  });
  const age = parseInt(document.getElementById('age').value) || 30;
  if (age > 35 && catalog.supplements) catalog.supplements.products.forEach(p => map.set(p.brand + '|' + p.name, p));
  return Array.from(map.values());
}

function buildPacks(issues) {
  if (!catalog) return [];
  const all = [];
  issues.forEach(i => {
    const it = catalog.issues[i.key];
    if (it) it.products.forEach(p => {
      if (!all.find(x => x.brand === p.brand && x.name === p.name)) all.push({...p});
    });
  });
  const pro = all.slice();
  const std = all.filter(p => p.priority <= 2);
  let basic = all.filter(p => p.priority === 1);
  if (basic.length < 2) all.filter(p => p.priority === 2).slice(0, 2 - basic.length).forEach(p => basic.push(p));
  return [
    { type:'pro', products: pro, meta: catalog.packs.pro },
    { type:'standard', products: std, meta: catalog.packs.standard },
    { type:'basic', products: basic, meta: catalog.packs.basic }
  ];
}

function showResults(issues, products, packs) {
  const il = document.getElementById('issues-list');
  const pl = document.getElementById('products-list');
  const kl = document.getElementById('packs-list');
  il.innerHTML = ''; pl.innerHTML = ''; kl.innerHTML = '';
  const sevMap = { low:'کم', medium:'متوسط', high:'زیاد' };
  issues.forEach(i => {
    const d = document.createElement('div');
    d.className = 'issue-item';
    d.innerHTML = `<h4><span class="severity ${i.severity}">${sevMap[i.severity]}</span> ${i.title}</h4><p>${i.desc}</p>`;
    il.appendChild(d);
  });
  products.forEach(p => {
    const d = document.createElement('div');
    d.className = 'product-item';
    d.innerHTML = `<span class="brand">${p.brand}</span><span class="name">${p.name}</span>`;
    pl.appendChild(d);
  });
  renderPacks(kl, packs);
}

function renderPacks(container, packs) {
  packs.forEach(pk => {
    const d = document.createElement('div');
    d.className = 'pack-card ' + pk.type;
    d.innerHTML = `
      <div class="pack-header">
        <span class="pack-title">${pk.meta.title}</span>
        <span class="pack-badge ${pk.type}">${pk.meta.badge}</span>
      </div>
      <div class="pack-desc">${pk.meta.desc}</div>
      <div>${pk.products.map(p => `<div class="pack-item">• [${p.brand}] ${p.name}</div>`).join('')}</div>
      <div class="pack-desc" style="margin-top:8px;">📦 تعداد: ${pk.products.length} محصول</div>
    `;
    container.appendChild(d);
  });
}

function renderPacksTab() {
  const c = document.getElementById('packs-detail');
  c.innerHTML = '';
  if (!lastResult || !lastResult.packs) {
    c.innerHTML = '<div class="empty-state">ابتدا یک اسکن انجام دهید.</div>';
    return;
  }
  renderPacks(c, lastResult.packs);
}

// ==================== سیستم بازخورد ====================
document.getElementById('fb-correct').onclick = () => {
  if (!lastResult || feedbackGiven) return;
  feedbackGiven = true;
  saveFeedbackSample(true, null, '');
  alert('✅ ممنون! نمونه در دیتاست ذخیره شد.');
  document.getElementById('fb-correction').classList.add('hidden');
};

document.getElementById('fb-wrong').onclick = () => {
  if (!lastResult) return;
  const box = document.getElementById('fb-correction');
  box.classList.remove('hidden');
  // ساخت گزینه‌ها از کاتالوگ
  const opts = document.getElementById('correction-options');
  opts.innerHTML = '';
  Object.entries(catalog.issues).forEach(([key, val]) => {
    const label = document.createElement('label');
    label.className = 'correction-option';
    label.innerHTML = `<input type="checkbox" value="${key}"> ${val.title}`;
    label.onclick = (e) => {
      if (e.target.tagName !== 'INPUT') {
        const cb = label.querySelector('input');
        cb.checked = !cb.checked;
      }
      label.classList.toggle('checked', label.querySelector('input').checked);
    };
    opts.appendChild(label);
  });
};

document.getElementById('fb-save-correction').onclick = () => {
  if (!lastResult) return;
  const checked = Array.from(document.querySelectorAll('#correction-options input:checked'))
    .map(c => c.value);
  if (checked.length === 0) { alert('حداقل یک عارضه انتخاب کنید.'); return; }
  const note = document.getElementById('fb-note').value;
  feedbackGiven = true;
  saveFeedbackSample(false, checked, note);
  alert('✅ اصلاح ذخیره شد. ممنون از همکاری!');
  document.getElementById('fb-correction').classList.add('hidden');
};

function saveFeedbackSample(isCorrect, correctedKeys, note) {
  // فشرده‌سازی عکس به thumbnail
  const thumb = document.createElement('canvas');
  const maxSide = 400;
  const ratio = Math.min(maxSide / lastCanvas.width, maxSide / lastCanvas.height);
  thumb.width = Math.floor(lastCanvas.width * ratio);
  thumb.height = Math.floor(lastCanvas.height * ratio);
  thumb.getContext('2d').drawImage(lastCanvas, 0, 0, thumb.width, thumb.height);
  const dataUrl = thumb.toDataURL('image/jpeg', 0.7);

  const sample = {
    id: Date.now(),
    date: new Date().toISOString(),
    image: dataUrl,
    scanArea: lastResult.scanArea,
    age: document.getElementById('age').value || '-',
    skinType: document.getElementById('skin-type').value,
    sensitivity: document.getElementById('sensitivity').value,
    detected: lastResult.issues.map(i => i.key),
    detectedTitles: lastResult.issues.map(i => i.title),
    isCorrect: isCorrect,
    corrected: correctedKeys || [],
    note: note || ''
  };

  const samples = JSON.parse(localStorage.getItem('poostyar_dataset') || '[]');
  samples.push(sample);
  localStorage.setItem('poostyar_dataset', JSON.stringify(samples));
}

// ==================== دیتاست ====================
function renderDataset() {
  const samples = JSON.parse(localStorage.getItem('poostyar_dataset') || '[]');
  const stats = document.getElementById('dataset-stats');
  const correct = samples.filter(s => s.isCorrect).length;
  const wrong = samples.filter(s => !s.isCorrect).length;

  stats.innerHTML = `
    <div class="stat-box"><div class="num">${samples.length}</div><div class="lbl">کل نمونه‌ها</div></div>
    <div class="stat-box"><div class="num">${correct}</div><div class="lbl">تشخیص درست</div></div>
    <div class="stat-box"><div class="num">${wrong}</div><div class="lbl">اصلاح‌شده</div></div>
    <div class="stat-box"><div class="num">${samples.length - correct}</div><div class="lbl">نیاز به یادگیری</div></div>
  `;

  const list = document.getElementById('dataset-list');
  if (samples.length === 0) {
    list.innerHTML = '<div class="empty-state">هنوز نمونه‌ای ثبت نشده.</div>';
    return;
  }
  list.innerHTML = '';
  samples.slice().reverse().slice(0, 20).forEach(s => {
    const d = document.createElement('div');
    d.className = 'dataset-item';
    d.innerHTML = `
      <img src="${s.image}" alt="">
      <div class="info">
        <div><strong>${s.isCorrect ? '✅ تأییدشده' : '✏️ اصلاح‌شده'}</strong></div>
        <div style="color:#888;font-size:11px;margin-top:2px;">
          ${s.detectedTitles.join('، ')}
        </div>
      </div>
    `;
    list.appendChild(d);
  });
  if (samples.length > 20) {
    const more = document.createElement('div');
    more.className = 'hint';
    more.textContent = `... و ${samples.length - 20} نمونه دیگر`;
    list.appendChild(more);
  }
}

document.getElementById('export-dataset').onclick = async () => {
  const samples = JSON.parse(localStorage.getItem('poostyar_dataset') || '[]');
  if (samples.length === 0) { alert('دیتاست خالی است.'); return; }

  const zip = new JSZip();
  const meta = [];

  samples.forEach((s, i) => {
    const filename = `sample_${String(i+1).padStart(4,'0')}_${s.isCorrect ? 'ok' : 'fix'}.jpg`;
    const base64 = s.image.split(',')[1];
    zip.file('images/' + filename, base64, { base64: true });
    meta.push({
      file: filename,
      date: s.date,
      scanArea: s.scanArea,
      age: s.age,
      skinType: s.skinType,
      sensitivity: s.sensitivity,
      detected: s.detected,
      isCorrect: s.isCorrect,
      corrected: s.corrected,
      note: s.note
    });
  });

  zip.file('labels.json', JSON.stringify(meta, null, 2));
  zip.file('README.txt',
`پوست‌یار - دیتاست آموزشی
تعداد نمونه: ${samples.length}
تاریخ خروجی: ${new Date().toLocaleString('fa-IR')}

فایل labels.json شامل برچسب هر تصویر است.
isCorrect=true یعنی تشخیص اپ درست بود.
isCorrect=false یعنی مشاور اصلاح کرد (corrected).

طراح: محمد سیستانی`);

  const blob = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `poostyar-dataset-${new Date().toISOString().slice(0,10)}.zip`;
  link.click();
};

document.getElementById('clear-dataset').onclick = () => {
  if (confirm('همه دیتاست پاک شود؟')) {
    localStorage.removeItem('poostyar_dataset');
    renderDataset();
  }
};

// ==================== واتساپ ====================
document.getElementById('send-whatsapp').onclick = () => {
  if (!lastResult) return;
  const name = document.getElementById('customer-name').value || 'مشتری';
  const age = document.getElementById('age').value || '-';
  const area = lastResult.scanArea === 'face' ? 'صورت' : 'مو و کف سر';

  let t = `🌿 گزارش پوست‌یار\n👤 ${name}\n🎂 ${age} سال\n🔍 ${area}\n\n`;
  t += `📋 عوارض:\n`;
  lastResult.issues.forEach(i => { t += `• ${i.title}\n`; });
  t += `\n💡 محصولات:\n`;
  lastResult.products.forEach(p => { t += `• [${p.brand}] ${p.name}\n`; });
  t += `\n📦 پک‌ها:\n`;
  lastResult.packs.forEach(pk => {
    t += `\n🔹 ${pk.meta.title} (${pk.products.length}):\n`;
    pk.products.forEach(p => { t += `   - ${p.name}\n`; });
  });
  t += `\n---\nطراح: محمد سیستانی`;
  window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank');
};

// ==================== سابقه ====================
document.getElementById('save-record').onclick = () => {
  if (!lastResult) return;
  const records = JSON.parse(localStorage.getItem('poostyar_records') || '[]');
  records.unshift({
    id: Date.now(),
    date: new Date().toLocaleString('fa-IR'),
    name: document.getElementById('customer-name').value || 'بدون نام',
    age: document.getElementById('age').value || '-',
    skinType: document.getElementById('skin-type').value,
    scanArea: lastResult.scanArea,
    issues: lastResult.issues,
    products: lastResult.products,
    packs: lastResult.packs.map(p => ({ type: p.type, title: p.meta.title, count: p.products.length }))
  });
  localStorage.setItem('poostyar_records', JSON.stringify(records));
  alert('✅ ذخیره شد');
};

function renderHistory() {
  const list = document.getElementById('history-list');
  const recs = JSON.parse(localStorage.getItem('poostyar_records') || '[]');
  if (recs.length === 0) { list.innerHTML = '<div class="empty-state">سابقه‌ای نیست.</div>'; return; }
  list.innerHTML = '';
  recs.forEach(r => {
    const d = document.createElement('div');
    d.className = 'history-item';
    d.innerHTML = `
      <div class="date">${r.date}</div>
      <div class="name">${r.name} (${r.age} ساله)</div>
      <div class="summary">${r.issues.map(i => '• ' + i.title).join('<br>')}</div>
    `;
    list.appendChild(d);
  });
}

document.getElementById('clear-history').onclick = () => {
  if (confirm('همه سابقه پاک شود؟')) {
    localStorage.removeItem('poostyar_records');
    renderHistory();
  }
};

// ==================== Excel ====================
document.getElementById('export-excel').onclick = () => {
  const recs = JSON.parse(localStorage.getItem('poostyar_records') || '[]');
  if (recs.length === 0) { alert('سابقه‌ای نیست.'); return; }
  let csv = '\uFEFFتاریخ,نام,سن,نوع پوست,ناحیه,عوارض,محصولات\n';
  recs.forEach(r => {
    const iss = r.issues.map(i => i.title).join(' | ');
    const pr = r.products.map(p => `[${p.brand}] ${p.name}`).join(' | ');
    const row = [r.date, r.name, r.age, r.skinType || '-',
      r.scanArea === 'face' ? 'صورت' : 'مو', iss, pr]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    csv += row + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `poostyar-records-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
};
