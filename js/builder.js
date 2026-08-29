'use strict';
/* builder.js — منشئ الأتمتة المرئي: عقد + سحب + توصيل + محاكاة تشغيل */
(function () {
  const canvas = document.getElementById('builder-canvas');
  if (!canvas) return;
  const wires = document.getElementById('wires');
  const hint = document.getElementById('canvas-hint');
  const A = appState.automation;

  const TYPES = {
    trigger: {
      label: 'محفّز', color: '#eda33c', icon: 'zap',
      items: ['بداية الحملة', 'موعد محدد', 'اكتمال عملية', 'فشل عملية', 'تغيّر حالة حساب']
    },
    condition: {
      label: 'شرط', color: '#3fc1d8', icon: 'branch',
      items: ['هل الحساب متصل؟', 'هل العملية نجحت؟', 'هل الحملة نشطة؟', 'هل تجاوزنا حد الطلبات؟']
    },
    action: {
      label: 'إجراء', color: '#2fbf8f', icon: 'send',
      items: ['نشر محتوى', 'جدولة منشور', 'مزامنة الحسابات', 'جمع الإحصائيات', 'إرسال إشعار', 'إعادة المحاولة']
    }
  };

  // تعبئة لوحة العناصر
  const pal = document.getElementById('palette');
  pal.innerHTML = Object.entries(TYPES).map(([t, cfg]) => `
    <h4>${cfg.label}s — ${cfg.label === 'محفّز' ? 'المحفزات' : cfg.label === 'شرط' ? 'الشروط' : 'الإجراءات'}</h4>
    ${cfg.items.map(it => `<div class="pal-item" data-type="${t}" data-label="${it}">
      <span class="pi" style="background:${cfg.color}">${icon(cfg.icon, 14)}</span>${it}</div>`).join('')}`).join('');

  let selected = null, wiring = null, tempPath = null;

  function nodeEl(n) {
    const cfg = TYPES[n.type];
    const el = document.createElement('div');
    el.className = `bnode t-${n.type}`;
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    el.dataset.nid = n.id;
    el.innerHTML = `
      <button class="bn-del" aria-label="حذف">✕</button>
      <div class="bn-head"><span class="bni" style="background:${cfg.color}">${icon(cfg.icon, 12)}</span>${cfg.label}</div>
      <div class="bn-body">${esc(n.label)}<div class="bn-sub">${esc(n.sub || '')}</div></div>
      ${n.type !== 'trigger' ? '<span class="port in" data-port="in"></span>' : ''}
      <span class="port out" data-port="out"></span>`;
    canvas.appendChild(el);

    // سحب العقدة
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.port') || e.target.closest('.bn-del')) return;
      select(n.id);
      const r = el.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const move = (ev) => {
        n.x = Math.max(0, ev.clientX - cr.left - dx + canvas.scrollLeft);
        n.y = Math.max(0, ev.clientY - cr.top - dy + canvas.scrollTop);
        el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
        drawWires();
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); saveState(); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });

    el.querySelector('.bn-del').onclick = (e) => {
      e.stopPropagation();
      A.nodes = A.nodes.filter(x => x.id !== n.id);
      A.edges = A.edges.filter(ed => ed.from !== n.id && ed.to !== n.id);
      saveState(); renderAll();
      toast('حُذفت العقدة', { type: 'info', duration: 1800 });
    };

    // التوصيل
    const out = el.querySelector('.port.out'), inp = el.querySelector('.port.in');
    out.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      wiring = n.id;
      tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tempPath.setAttribute('class', 'temp');
      wires.appendChild(tempPath);
      const mv = (ev) => {
        const cr = canvas.getBoundingClientRect();
        const x1 = n.x + 210, y1 = n.y + 40;
        const x2 = ev.clientX - cr.left + canvas.scrollLeft, y2 = ev.clientY - cr.top + canvas.scrollTop;
        tempPath.setAttribute('d', wirePath(x1, y1, x2, y2));
      };
      const up = () => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        tempPath?.remove(); tempPath = null; wiring = null;
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    if (inp) inp.addEventListener('pointerup', (e) => {
      if (!wiring || wiring === n.id) return;
      e.stopPropagation();
      if (!A.edges.some(ed => ed.from === wiring && ed.to === n.id)) {
        A.edges.push({ from: wiring, to: n.id });
        saveState(); drawWires();
        toast('تم ربط العقدتين', { type: 'ok', duration: 1600 });
      }
    });

    // تعديل بالنقر المزدوج
    el.addEventListener('dblclick', () => editNode(n));
    return el;
  }

  function editNode(n) {
    const m = openModal({
      title: 'تعديل العقدة', size: 'sm',
      body: `
        <div class="field"><label>النوع</label><select class="select" id="en-label">${TYPES[n.type].items.map(i => `<option ${i === n.label ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
        <div class="field"><label>ملاحظة</label><input class="input" id="en-sub" value="${esc(n.sub || '')}" placeholder="وصف اختياري"></div>`,
      actions: `<button class="btn btn-primary" id="en-save">حفظ</button><button class="btn btn-ghost" id="en-cancel">إلغاء</button>`
    });
    m.el.querySelector('#en-cancel').onclick = m.close;
    m.el.querySelector('#en-save').onclick = () => {
      n.label = m.el.querySelector('#en-label').value;
      n.sub = m.el.querySelector('#en-sub').value.trim();
      saveState(); m.close(); renderAll();
    };
  }

  function wirePath(x1, y1, x2, y2) {
    const dx = Math.max(50, Math.abs(x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }

  function drawWires() {
    wires.querySelectorAll('path:not(.temp)').forEach(p => p.remove());
    const W = Math.max(canvas.scrollWidth, 900), H = Math.max(canvas.scrollHeight, 560);
    wires.setAttribute('width', W); wires.setAttribute('height', H);
    A.edges.forEach(ed => {
      const a = A.nodes.find(n => n.id === ed.from), b = A.nodes.find(n => n.id === ed.to);
      if (!a || !b) return;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', wirePath(a.x + 210, a.y + 40, b.x, b.y + 40));
      p.style.pointerEvents = 'stroke'; p.style.cursor = 'pointer';
      p.addEventListener('dblclick', () => {
        A.edges = A.edges.filter(x => x !== ed); saveState(); drawWires();
        toast('أُزيل الربط', { type: 'info', duration: 1500 });
      });
      wires.appendChild(p);
    });
  }

  function select(id) {
    selected = id;
    canvas.querySelectorAll('.bnode').forEach(el => el.classList.toggle('selected', +el.dataset.nid === id));
  }

  function renderAll() {
    canvas.querySelectorAll('.bnode').forEach(x => x.remove());
    A.nodes.forEach(n => nodeEl(n));
    hint.style.display = A.nodes.length ? 'none' : 'flex';
    drawWires();
  }

  // إضافة بالسحب أو النقر
  function addNode(type, label, x, y) {
    const n = { id: ++A.seq, type, label, sub: '', x: Math.max(10, x || 60 + (A.seq % 4) * 60), y: Math.max(10, y || 60 + A.nodes.length * 70) };
    A.nodes.push(n); saveState(); renderAll(); select(n.id);
  }
  pal.querySelectorAll('.pal-item').forEach(item => {
    item.addEventListener('click', () => addNode(item.dataset.type, item.dataset.label));
    item.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', JSON.stringify({ type: item.dataset.type, label: item.dataset.label })));
    item.setAttribute('draggable', 'true');
  });
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    try {
      const d = JSON.parse(e.dataTransfer.getData('text/plain'));
      const cr = canvas.getBoundingClientRect();
      addNode(d.type, d.label, e.clientX - cr.left - 100 + canvas.scrollLeft, e.clientY - cr.top - 30 + canvas.scrollTop);
    } catch {}
  });
  canvas.addEventListener('pointerdown', (e) => { if (e.target === canvas) select(null); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selected && !e.target.closest('input,textarea')) {
      A.nodes = A.nodes.filter(n => n.id !== selected);
      A.edges = A.edges.filter(ed => ed.from !== selected && ed.to !== selected);
      selected = null; saveState(); renderAll();
    }
  });

  // شريط الأدوات
  document.getElementById('tb-clear').onclick = () => confirmDialog({
    message: 'مسح كل العقد والروابط من اللوحة؟', confirmText: 'مسح الكل',
    onConfirm: () => { A.nodes = []; A.edges = []; saveState(); renderAll(); }
  });
  document.getElementById('tb-demo').onclick = () => {
    A.nodes = [
      { id: 1, type: 'trigger', label: 'بداية الحملة', sub: '', x: 60, y: 80 },
      { id: 2, type: 'condition', label: 'هل الحساب متصل؟', sub: '', x: 340, y: 80 },
      { id: 3, type: 'action', label: 'نشر محتوى', sub: '', x: 620, y: 40 },
      { id: 4, type: 'action', label: 'إعادة المحاولة', sub: 'بعد 30 ثانية', x: 620, y: 180 },
      { id: 5, type: 'action', label: 'إرسال إشعار', sub: '', x: 900, y: 110 }
    ];
    A.edges = [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 2, to: 4 }, { from: 3, to: 5 }, { from: 4, to: 5 }];
    A.seq = 5; saveState(); renderAll();
    toast('تم تحميل مثال جاهز', { type: 'ok' });
  };
  document.getElementById('tb-run').onclick = () => {
    if (!A.nodes.length) return toast('اللوحة فارغة', { type: 'warn' });
    const order = [];
    const starts = A.nodes.filter(n => n.type === 'trigger');
    const visit = (id) => {
      if (order.includes(id)) return;
      order.push(id);
      A.edges.filter(e => e.from === id).forEach(e => visit(e.to));
    };
    starts.forEach(s => visit(s.id));
    A.nodes.forEach(n => !order.includes(n.id) && order.push(n.id));
    toast('بدأت محاكاة سير الأتمتة…', { type: 'info', duration: 1800 });
    order.forEach((nid, i) => {
      setTimeout(() => {
        select(nid);
        const n = A.nodes.find(x => x.id === nid);
        if (i === order.length - 1) toast('اكتملت المحاكاة بنجاح', { body: `${order.length} عقدة نُفذت بالترتيب`, type: 'ok' });
      }, i * 650);
    });
  };

  renderAll();
})();
