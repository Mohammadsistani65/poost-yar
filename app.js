// ==================== پوست‌یار ====================
// طراح: محمد سیستانی
// =====================================================

let catalog = null;
let stream = null;
let currentFacing = 'user';
let lastResult = null;

// بارگذاری کاتالوگ
async function loadCatalog() {
  try {
    const r = await fetch('products.json?v=' + Date.now());
    catalog = await r.json();
  } catch (e) {
    alert('کاتالوگ محصولات بارگذاری نشد. اینترنت را چک کنید.');
    console.error(e);
  }
}
loadCatalog();

// ==================== تب‌ها ====================
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.getElementById('tab-scan').classList.toggle('hidden', target !== 'scan');
    document.getElementById('tab-packs').classList.toggle('hidden', target !== 'packs');
    document.getElementById('tab-history').classList.toggle('hidden', target !== 'history');
    if (target === 'history') renderHistory();
    if (target === 'packs') renderPacksTab();
  };
});

// ==================== ناوبری مراحل ====================
const formSection = document.getElementById('form-section');
const cameraSection = document.getElementById('camera-section');
const resultSection = document.getElementById('result-section');

document.getElementById('next-to-camera').onclick = () => {
  const area = document.getElementById('scan-area').value;
  const label = area === 'face' ? 'صورت' : 'مو و کف سر';
  document.getElementById('scan-area-label').textContent = label;
  document.getElementById('camera-hint').textContent = area === 'face'
    ? 'صورت را در نور مناسب و بدون آرایش مقابل دوربین قرار دهید.'
    : 'برای اسکن مو، از دوربین پشت استفاده کنید و کف سر را در نور مناسب قرار دهید.';
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
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacing, width: { ideal: 720 }, height: { ideal: 960 } }
    });
    document.getElementById('video').srcObject = stream;
  } catch (e) {
    if (currentFacing === 'environment') {
      currentFacing = 'user';
      return startCamera();
    }
    alert('دسترسی به دوربین ممکن نشد.');
    console.error(e);
  }
}

document.getElementById('switch-camera').onclick = () => {
  currentFacing = currentFacing === 'user' ? 'environment' : 'user';
  startCamera();
};

// ==================== تحلیل تصویر ====================
document.getElementById('capture').onclick = async () => {
  const video = document.getElementById('video');
  if (!video.videoWidth) { alert('دوربین آماده نیست.'); return; }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  if (stream) stream.getTracks().forEach(t => t.stop());

  const scanArea = document.getElementById('scan-area').value;
  const issues = analyzeImage(canvas, scanArea);
  const products = buildProducts(issues);
  const packs = buildPacks(issues);

  lastResult = { issues, products, packs, scanArea };
  showResults(issues, products, packs);

  cameraSection.classList.add('hidden');
  resultSection.classList.remove('hidden');
};

function analyzeImage(canvas, scanArea) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const regions = {
    forehead: { x0: 0.3, x1: 0.7, y0: 0.10, y1: 0.25 },
    eyes:     { x0: 0.2, x1: 0.8, y0: 0.30, y1: 0.45 },
    nose:     { x0: 0.35, x1: 0.65, y0: 0.40, y1: 0.55 },
    cheeks:   { x0: 0.15, x1: 0.85, y0: 0.45, y1: 0.65 },
    chin:     { x0: 0.35, x1: 0.65, y0: 0.65, y1: 0.85 }
  };

  function regionStats(r) {
    const x0 = Math.floor(w * r.x0), x1 = Math.floor(w * r.x1);
    const y0 = Math.floor(h * r.y0), y1 = Math.floor(h * r.y1);
    let count = 0, red = 0, shine = 0, dark = 0, edge = 0, prev = -1;
    let sumR = 0;
    for (let y = y0; y < y1; y += 4) {
      for (let x = x0; x < x1; x += 4) {
        const i = (y * w + x) * 4;
        const R = d[i], G = d[i+1], B = d[i+2];
        sumR += R;
        count++;
        if (R > 140 && (R - G) > 35 && (R - B) > 25) red++;
        const lum = 0.299*R + 0.587*G + 0.114*B;
        if (lum > 200) shine++;
        if (lum < 90) dark++;
        if (prev >= 0 && Math.abs(lum - prev) > 30) edge++;
        prev = lum;
      }
    }
    return {
      redness: red / count, shine: shine / count,
      darkness: dark / count, texture: edge / count, avgR: sumR / count
    };
  }

  const stats = {};
  for (const k in regions) stats[k] = regionStats(regions[k]);

  const total = { redness: 0, shine: 0, darkness: 0, texture: 0, avgR: 0 };
  Object.values(stats).forEach(s => {
    total.redness += s.redness; total.shine += s.shine;
    total.darkness += s.darkness; total.texture += s.texture;
    total.avgR += s.avgR;
  });
  const n = Object.keys(stats).length;
  total.redness /= n; total.shine /= n; total.darkness /= n;
  total.texture /= n; total.avgR /= n;

  const issues = [];

  if (scanArea === 'scalp') {
    if (total.shine > 0.20) {
      issues.push({ key: 'dandruff', title: 'احتمال شوره یا چربی کف سر',
        severity: total.shine > 0.30 ? 'high' : 'medium',
        desc: 'براقیت و ترشح چربی در ناحیه کف سر مشاهده شد.' });
    }
    if (total.texture > 0.28 || total.darkness > 0.25) {
      issues.push({ key: 'hairLoss', title: 'احتمال ضعیف شدن فولیکول مو',
        severity: total.texture > 0.35 ? 'high' : 'medium',
        desc: 'کاهش تراکم و ناهمواری در ناحیه مو مشاهده شد.' });
    }
    if (issues.length === 0) {
      issues.push({ key: 'hairLoss', title: 'مو و کف سر سالم',
        severity: 'low', desc: 'مشکل حادی مشاهده نشد. مراقبت روزانه توصیه می‌شود.' });
    }
  } else {
    if (stats.forehead.texture > 0.28 || stats.eyes.texture > 0.28) {
      issues.push({ key: 'wrinkles', title: 'احتمال چین و چروک',
        severity: stats.forehead.texture > 0.35 ? 'high' : 'medium',
        desc: 'خطوط در ناحیه پیشانی و اطراف چشم مشاهده شد.' });
    }
    if (stats.cheeks.darkness > 0.20 || stats.forehead.darkness > 0.20) {
      issues.push({ key: 'spots', title: 'احتمال لک و تیرگی',
        severity: stats.cheeks.darkness > 0.30 ? 'high' : 'medium',
        desc: 'تیرگی در ناحیه گونه‌ها و پیشانی مشاهده شد.' });
    }
    if (stats.nose.shine > 0.22 || stats.forehead.shine > 0.22) {
      issues.push({ key: 'oily', title: 'احتمال پوست چرب و منافذ باز',
        severity: stats.nose.shine > 0.32 ? 'high' : 'medium',
        desc: 'براقیت در ناحیه بینی و پیشانی مشاهده شد.' });
    }
    if (stats.cheeks.redness > 0.15 || stats.chin.redness > 0.15) {
      issues.push({ key: 'acne', title: 'احتمال آکنه و التهاب',
        severity: stats.cheeks.redness > 0.25 ? 'high' : 'medium',
        desc: 'قرمزی و التهاب در ناحیه گونه‌ها یا چانه مشاهده شد.' });
    }
    if (total.avgR < 120) {
      issues.push({ key: 'dry', title: 'احتمال خشکی و کم‌آبی',
        severity: total.avgR < 100 ? 'high' : 'medium',
        desc: 'کاهش رطوبت و روشنایی پوست مشاهده شد.' });
    }
    if (issues.length === 0) {
      issues.push({ key: 'dry', title: 'پوست سالم و متعادل',
        severity: 'low', desc: 'مشکل خاصی مشاهده نشد. مراقبت روزانه توصیه می‌شود.' });
    }
  }
  return issues;
}

// ==================== ساخت لیست محصولات ====================
function buildProducts(issues) {
  if (!catalog) return [];
  const productSet = new Map();
  issues.forEach(issue => {
    const item = catalog.issues[issue.key];
    if (item) {
      item.products.forEach(p => productSet.set(p.brand + '|' + p.name, p));
    }
  });
  const age = parseInt(document.getElementById('age').value) || 30;
  if (age > 35 && catalog.supplements) {
    catalog.supplements.products.forEach(p => productSet.set(p.brand + '|' + p.name, p));
  }
  return Array.from(productSet.values());
}

// ==================== ساخت پک‌ها ====================
function buildPacks(issues) {
  if (!catalog) return [];
  // جمع‌آوری همه محصولات مرتبط
  const allProducts = [];
  issues.forEach(issue => {
    const item = catalog.issues[issue.key];
    if (item) {
      item.products.forEach(p => {
        if (!allProducts.find(x => x.brand === p.brand && x.name === p.name)) {
          allProducts.push({ ...p, issue: issue.title });
        }
      });
    }
  });

  // پک حرفه‌ای: همه محصولات با اولویت ۱ و ۲ و ۳
  const proProducts = allProducts.slice();

  // پک استاندارد: محصولات اولویت ۱ و ۲
  const stdProducts = allProducts.filter(p => p.priority <= 2);

  // پک پایه: فقط اولویت ۱
  const basicProducts = allProducts.filter(p => p.priority === 1);

  // اگر پک پایه کمتر از ۲ محصول شد، یکی از اولویت ۲ اضافه کن
  if (basicProducts.length < 2) {
    allProducts.filter(p => p.priority === 2).slice(0, 2 - basicProducts.length)
      .forEach(p => basicProducts.push(p));
  }

  return [
    { type: 'pro', products: proProducts, meta: catalog.packs.pro },
    { type: 'standard', products: stdProducts, meta: catalog.packs.standard },
    { type: 'basic', products: basicProducts, meta: catalog.packs.basic }
  ];
}

// ==================== نمایش نتیجه ====================
function showResults(issues, products, packs) {
  const issuesList = document.getElementById('issues-list');
  const productsList = document.getElementById('products-list');
  const packsList = document.getElementById('packs-list');
  issuesList.innerHTML = '';
  productsList.innerHTML = '';
  packsList.innerHTML = '';

  const sevMap = { low: 'کم', medium: 'متوسط', high: 'زیاد' };
  issues.forEach(issue => {
    const div = document.createElement('div');
    div.className = 'issue-item';
    div.innerHTML = `<h4><span class="severity ${issue.severity}">${sevMap[issue.severity]}</span> ${issue.title}</h4><p>${issue.desc}</p>`;
    issuesList.appendChild(div);
  });

  products.forEach(p => {
    const div = document.createElement('div');
    div.className = 'product-item';
    div.innerHTML = `<span class="brand">${p.brand}</span><span class="name">${p.name}</span>`;
    productsList.appendChild(div);
  });

  // نمایش پک‌ها
  renderPacks(packsList, packs);
}

function renderPacks(container, packs) {
  packs.forEach(pack => {
    const div = document.createElement('div');
    div.className = 'pack-card ' + pack.type;
    div.innerHTML = `
      <div class="pack-header">
        <span class="pack-title">${pack.meta.title}</span>
        <span class="pack-badge ${pack.type}">${pack.meta.badge}</span>
      </div>
      <div class="pack-desc">${pack.meta.desc}</div>
      <div>${pack.products.map(p => `<div class="pack-item">• [${p.brand}] ${p.name}</div>`).join('')}</div>
      <div class="pack-desc" style="margin-top:8px;">📦 تعداد: ${pack.products.length} محصول</div>
    `;
    container.appendChild(div);
  });
}

// ==================== تب پک‌ها ====================
function renderPacksTab() {
  const container = document.getElementById('packs-detail');
  container.innerHTML = '';
  if (!lastResult || !lastResult.packs) {
    container.innerHTML = '<div class="empty-state">ابتدا یک اسکن انجام دهید.</div>';
    return;
  }
  renderPacks(container, lastResult.packs);
}

// ==================== ارسال به واتساپ ====================
document.getElementById('send-whatsapp').onclick = () => {
  if (!lastResult) return;
  const name = document.getElementById('customer-name').value || 'مشتری';
  const age = document.getElementById('age').value || '-';
  const scanArea = lastResult.scanArea === 'face' ? 'صورت' : 'مو و کف سر';

  let text = `🌿 گزارش پوست‌یار\n`;
  text += `👤 نام: ${name}\n🎂 سن: ${age}\n🔍 ناحیه: ${scanArea}\n\n`;
  text += `📋 عوارض شناسایی‌شده:\n`;
  lastResult.issues.forEach(i => { text += `• ${i.title}\n`; });
  text += `\n💡 محصولات مورد نیاز:\n`;
  lastResult.products.forEach(p => { text += `• [${p.brand}] ${p.name}\n`; });
  text += `\n📦 پک‌های پیشنهادی:\n`;
  lastResult.packs.forEach(pack => {
    text += `\n🔹 ${pack.meta.title} (${pack.products.length} محصول):\n`;
    pack.products.forEach(p => { text += `   - ${p.name}\n`; });
  });
  text += `\n---\nطراح: محمد سیستانی`;

  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
};

// ==================== ذخیره سابقه ====================
document.getElementById('save-record').onclick = () => {
  if (!lastResult) return;
  const records = JSON.parse(localStorage.getItem('poostyar_records') || '[]');
  records.unshift({
    id: Date.now(),
    date: new Date().toLocaleString('fa-IR'),
    name: document.getElementById('customer-name').value || 'بدون نام',
    age: document.getElementById('age').value || '-',
    skinType: document.getElementById('skin-type').value,
    sensitivity: document.getElementById('sensitivity').value,
    scanArea: lastResult.scanArea,
    issues: lastResult.issues,
    products: lastResult.products,
    packs: lastResult.packs.map(p => ({ type: p.type, title: p.meta.title, count: p.products.length }))
  });
  localStorage.setItem('poostyar_records', JSON.stringify(records));
  alert('✅ ذخیره شد');
};

// ==================== نمایش سابقه ====================
function renderHistory() {
  const list = document.getElementById('history-list');
  const records = JSON.parse(localStorage.getItem('poostyar_records') || '[]');
  if (records.length === 0) {
    list.innerHTML = '<div class="empty-state">هنوز سابقه‌ای ثبت نشده است.</div>';
    return;
  }
  list.innerHTML = '';
  records.forEach(r => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="date">${r.date}</div>
      <div class="name">${r.name} (${r.age} ساله)</div>
      <div class="summary">${r.issues.map(i => '• ' + i.title).join('<br>')}</div>
    `;
    list.appendChild(div);
  });
}

document.getElementById('clear-history').onclick = () => {
  if (confirm('همه سابقه پاک شود؟')) {
    localStorage.removeItem('poostyar_records');
    renderHistory();
  }
};

// ==================== خروجی Excel ====================
document.getElementById('export-excel').onclick = () => {
  const records = JSON.parse(localStorage.getItem('poostyar_records') || '[]');
  if (records.length === 0) { alert('سابقه‌ای وجود ندارد'); return; }

  let csv = '\uFEFF'; // BOM برای فارسی
  csv += 'تاریخ,نام,سن,نوع پوست,حساسیت,ناحیه,عوارض,محصولات,پک حرفه‌ای,پک استاندارد,پک پایه\n';

  records.forEach(r => {
    const issues = r.issues.map(i => i.title).join(' | ');
    const products = r.products.map(p => `[${p.brand}] ${p.name}`).join(' | ');
    const pro = r.packs.find(p => p.type === 'pro');
    const std = r.packs.find(p => p.type === 'standard');
    const bas = r.packs.find(p => p.type === 'basic');
    const row = [
      r.date, r.name, r.age, r.skinType || '-', r.sensitivity || '-',
      r.scanArea === 'face' ? 'صورت' : 'مو',
      issues, products,
      pro ? pro.count : 0, std ? std.count : 0, bas ? bas.count : 0
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    csv += row + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `poostyar-records-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
};
