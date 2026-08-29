'use strict';
/* campaigns.js — قائمة الحملات + تفاصيل الحملة + معالج الإنشاء */
(function () {
  /* ============ قائمة الحملات ============ */
  const listRoot = document.getElementById('campaigns-root');
  if (listRoot) {
    let status = new URLSearchParams(location.search).get('status') || '';
    const render = () => {
      const rows = appState.campaigns.filter(c => !status || c.status === status);
      listRoot.innerHTML = `
        <div class="between mb-2 wrap">
          <div class="chips">
            <span class="chip ${!status ? 'active' : ''}" onclick="campFilter('')">الكل <span class="n num">${appState.campaigns.length}</span></span>
            ${Object.entries(CAMP_STATUS).map(([k, m]) => `<span class="chip ${status === k ? 'active' : ''}" onclick="campFilter('${k}')">${m.t} <span class="n num">${appState.campaigns.filter(c => c.status === k).length}</span></span>`).join('')}
          </div>
          <button class="btn btn-primary" onclick="openCampaignWizard()">${icon('plus', 15)} إنشاء حملة</button>
        </div>
        <div class="camp-grid">
          ${rows.map(c => `
            <div class="card hoverable camp-card">
              <div class="cc-head">
                <div class="grow clickable" onclick="location.href='campaign-details.html?id=${c.id}'">
                  <div class="cc-name">${esc(c.name)}</div>
                  <div class="cc-client">${esc(c.client || '')} ${c.objective ? '· ' + esc(c.objective) : ''}</div>
                </div>${campBadge(c.status)}
              </div>
              <div class="cc-dates">
                <span>${icon('calendar', 13)} ${fmtDate(c.start)} ← ${fmtDate(c.end)}</span>
                ${c.budget ? `<span>${icon('wallet', 13)} <span class="num">${fmtFull(c.budget)}</span> ر.س</span>` : ''}
              </div>
              <div class="camp-kpis">
                <span>الأصول <b class="num">${c.accountIds.length}</b></span>
                <span>العمليات <b class="num">${c.jobsTotal}</b></span>
                <span>ناجحة <b class="text-green num">${c.jobsOk}</b></span>
                <span>فاشلة <b class="text-red num">${c.jobsFail}</b></span>
              </div>
              ${progressRow(c.progress, 'تقدم التنفيذ')}
              <div class="cc-foot">
                <div class="flex" style="gap:6px">
                  ${c.status === 'draft' || c.status === 'scheduled' || c.status === 'paused' ? `<button class="btn btn-primary btn-sm" onclick="Engine.launchCampaign(${c.id})">${icon('play', 13)} إطلاق</button>` : ''}
                  ${c.status === 'active' ? `<button class="btn btn-ghost btn-sm" onclick="Engine.pauseCampaign(${c.id})">${icon('pause', 13)} إيقاف</button><button class="btn btn-success btn-sm" onclick="Engine.completeCampaign(${c.id})">${icon('check', 13)} إنهاء</button>` : ''}
                </div>
                <div class="flex" style="gap:6px">
                  <a class="btn btn-ghost btn-sm" href="campaign-details.html?id=${c.id}">فتح</a>
                  <button class="btn btn-danger btn-sm" onclick="delCampaign(${c.id})">${icon('trash', 13)}</button>
                </div>
              </div>
            </div>`).join('') || emptyState('target', 'لا حملات هنا', 'أنشئ حملة جديدة لتبدأ', `<button class="btn btn-primary" onclick="openCampaignWizard()">${icon('plus', 15)} إنشاء حملة</button>`)}
        </div>`;
    };
    window.campFilter = (v) => { status = v; render(); };
    window.delCampaign = (id) => {
      const c = appState.campaigns.find(x => x.id === id);
      confirmDialog({
        message: `حذف حملة <b>${esc(c.name)}</b> وكل مهامها؟`, confirmText: 'حذف الحملة',
        onConfirm: () => { DB.removeCampaign(id); toast('تم حذف الحملة', { type: 'ok' }); render(); }
      });
    };
    Bus.on('campaigns', render);
    render();
  }

  /* ============ معالج إنشاء حملة (خطوتان) ============ */
  window.openCampaignWizard = () => {
    let campId = null;
    const m = openModal({
      title: 'إنشاء حملة جديدة', sub: 'الخطوة 1 من 2 — معلومات الحملة', size: 'lg',
      body: `
        <div id="cw-body">
          <div class="form-row">
            <div class="field"><label>اسم الحملة <span class="req">*</span></label><input class="input" id="cw-name" placeholder="مثال: إطلاق المنتج الجديد"></div>
            <div class="field"><label>العميل</label><input class="input" id="cw-client" placeholder="اسم العميل"></div>
          </div>
          <div class="field"><label>وصف الحملة</label><textarea class="textarea" id="cw-desc" placeholder="ما هدف هذه الحملة؟"></textarea></div>
          <div class="form-row">
            <div class="field"><label>الهدف</label><select class="select" id="cw-obj"><option>زيادة الوعي</option><option>المبيعات</option><option>توليد العملاء</option><option>التفاعل</option><option>زيارات الفرع</option></select></div>
            <div class="field"><label>الميزانية (ر.س)</label><input class="input num" id="cw-budget" type="number" min="0" placeholder="0"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>تاريخ البداية</label><input class="input" id="cw-start" type="date"></div>
            <div class="field"><label>تاريخ النهاية</label><input class="input" id="cw-end" type="date"></div>
          </div>
        </div>`,
      actions: `<button class="btn btn-primary" id="cw-next">التالي: اختيار الأصول ${icon('chevron-down', 13)}</button><button class="btn btn-ghost" id="cw-cancel">إلغاء</button>`
    });
    m.el.querySelector('#cw-cancel').onclick = m.close;
    m.el.querySelector('#cw-next').onclick = () => {
      if (!campId) {
        const name = m.el.querySelector('#cw-name').value.trim();
        if (!name) return toast('اسم الحملة مطلوب', { type: 'warn' });
        const c = DB.addCampaign({
          name, client: m.el.querySelector('#cw-client').value.trim(),
          description: m.el.querySelector('#cw-desc').value.trim(),
          objective: m.el.querySelector('#cw-obj').value,
          budget: +m.el.querySelector('#cw-budget').value || null,
          start: m.el.querySelector('#cw-start').value, end: m.el.querySelector('#cw-end').value
        });
        campId = c.id;
        m.el.querySelector('.m-sub').textContent = 'الخطوة 2 من 2 — اختيار الأصول';
        m.el.querySelector('#cw-body').innerHTML = `
          <div class="field"><label>مجموعات كاملة</label><div class="check-list" style="max-height:130px">
            ${appState.groups.map(g => `<label class="check-item"><input type="checkbox" data-gid="${g.id}"><span class="gc-icon" style="background:${g.color};width:26px;height:26px">${icon('folder', 13)}</span>${esc(g.name)}<span class="tiny muted">(${g.accountIds.length} حسابًا)</span></label>`).join('') || '<div class="muted small" style="padding:8px">لا مجموعات</div>'}
          </div></div>
          <div class="field"><label>أو حسابات فردية</label><div class="check-list" style="max-height:170px">
            ${appState.accounts.map(a => `<label class="check-item"><input type="checkbox" data-aid="${a.id}">${accAvatar(a, 26)}<span class="grow truncate">${esc(a.name)}</span>${accBadge(a.status)}</label>`).join('')}
          </div></div>
          <div class="small muted">تم اختيار <b class="text-brand" id="cw-count">0</b> عنصرًا</div>`;
        m.el.querySelector('#cw-body').addEventListener('change', () => {
          m.el.querySelector('#cw-count').textContent = m.el.querySelectorAll('#cw-body input:checked').length;
        });
        m.el.querySelector('#cw-next').textContent = 'إنشاء الحملة';
      } else {
        const gIds = [...m.el.querySelectorAll('[data-gid]:checked')].map(x => +x.dataset.gid);
        const aIds = new Set([...m.el.querySelectorAll('[data-aid]:checked')].map(x => +x.dataset.aid));
        gIds.forEach(gid => appState.groups.find(g => g.id === gid)?.accountIds.forEach(a => aIds.add(a)));
        DB.updateCampaign(campId, { accountIds: [...aIds] });
        [...aIds].forEach(aid => { const a = appState.accounts.find(x => x.id === aid); if (a && !a.campaigns.includes(campId)) a.campaigns.push(campId); });
        saveState();
        m.close();
        toast('أُنشئت الحملة كمسودة', { body: `ربُطت ${aIds.size} أصول`, type: 'ok' });
        location.href = 'campaign-details.html?id=' + campId;
      }
    };
  };

  /* ============ تفاصيل الحملة ============ */
  const detRoot = document.getElementById('campaign-detail-root');
  if (detRoot) {
    const id = +new URLSearchParams(location.search).get('id');
    const render = () => {
      const c = appState.campaigns.find(x => x.id === id);
      if (!c) { detRoot.innerHTML = emptyState('target', 'الحملة غير موجودة', '', '<a class="btn btn-primary" href="campaigns.html">عودة للحملات</a>'); return; }
      const assets = c.accountIds.map(aid => appState.accounts.find(a => a.id === aid)).filter(Boolean);
      const jobs = appState.jobs.filter(j => j.campaignId === id);
      const posts = appState.posts.filter(p => p.campaignId === id);
      const stages = ['إنشاء الحملة', 'ربط الأصول', 'إعداد المحتوى', 'الجدولة', 'التنفيذ', 'جمع النتائج'];
      const nowStage = c.status === 'draft' ? (assets.length ? 1 : 0) : c.status === 'active' ? 4 : c.status === 'completed' ? 6 : 3;
      detRoot.innerHTML = `
        <div class="card mb-2"><div class="camp-hero">
          <div class="grow">
            <div class="flex wrap" style="gap:10px"><h2>${esc(c.name)}</h2>${campBadge(c.status)}</div>
            <div class="muted small mt-1">${esc(c.client || '')} ${c.objective ? '· الهدف: ' + esc(c.objective) : ''} ${c.budget ? '· الميزانية: <span class="num">' + fmtFull(c.budget) + '</span> ر.س' : ''}</div>
            <div class="cc-dates mt-1">${icon('calendar', 13)} ${fmtDate(c.start)} ← ${fmtDate(c.end)}</div>
          </div>
          <div class="ch-actions">
            ${c.status !== 'active' && c.status !== 'completed' ? `<button class="btn btn-primary btn-sm" onclick="Engine.launchCampaign(${c.id})">${icon('play', 14)} إطلاق الحملة</button>` : ''}
            ${c.status === 'active' ? `<button class="btn btn-ghost btn-sm" onclick="Engine.pauseCampaign(${c.id})">${icon('pause', 14)} إيقاف مؤقت</button><button class="btn btn-success btn-sm" onclick="Engine.completeCampaign(${c.id})">${icon('check', 14)} إنهاء</button>` : ''}
            <a class="btn btn-ghost btn-sm" href="campaign-builder.html?campaign=${c.id}">${icon('branch', 14)} منشئ الأتمتة</a>
          </div>
        </div>
        <div class="kpi-inline mt-2">
          <div class="kpi"><div class="kv num">${assets.length}</div><div class="kl">الأصول</div></div>
          <div class="kpi"><div class="kv num">${c.jobsTotal}</div><div class="kl">المهام</div></div>
          <div class="kpi"><div class="kv num text-green">${c.jobsOk}</div><div class="kl">ناجحة</div></div>
          <div class="kpi"><div class="kv num text-red">${c.jobsFail}</div><div class="kl">فاشلة</div></div>
          <div class="kpi"><div class="kv num">${fmtNum(c.reach)}</div><div class="kl">الوصول</div></div>
          <div class="kpi"><div class="kv num">${fmtNum(c.engagement)}</div><div class="kl">التفاعل</div></div>
        </div>
        ${c.jobsTotal ? `<div class="mt-2">${progressRow(c.progress, `تقدم التنفيذ — ${c.jobsOk + c.jobsFail} / ${c.jobsTotal} مهمة`)}</div>` : ''}
        </div>
        <div class="grid" style="grid-template-columns:340px 1fr;align-items:start" id="cd-cols">
          <div class="flex-col">
            <div class="card"><div class="card-title mb-2">${icon('branch', 17)} مخطط سير الحملة</div>
              <div class="flow-steps">${stages.map((s, i) => `
                <div class="flow-node ${i < nowStage ? 'done' : i === nowStage ? 'now' : ''}">${i < nowStage ? icon('check', 14) : ''}${s}</div>
                ${i < stages.length - 1 ? '<div class="flow-arrow"></div>' : ''}`).join('')}
              </div></div>
            <div class="card"><div class="card-title mb-2">${icon('users', 17)} الأصول المرتبطة (${assets.length})</div>
              <div class="mini-list">${assets.map(a => `
                <div class="mini-row clickable" onclick="location.href='account-details.html?id=${a.id}'">
                  ${accAvatar(a, 30)}<div class="grow"><div class="lr-title truncate">${esc(a.name)}</div><div class="lr-sub">${SEED.platforms[a.platform].name}</div></div>${accBadge(a.status)}
                </div>`).join('') || '<div class="muted small">لم تُربط أصول بعد</div>'}</div></div>
          </div>
          <div class="flex-col">
            <div class="card"><div class="between mb-2"><div class="card-title">${icon('file', 17)} محتوى الحملة (${posts.length})</div>
              <a class="btn btn-ghost btn-sm" href="content.html">${icon('plus', 13)} محتوى جديد</a></div>
              <div class="mini-list">${posts.slice(0, 5).map(p => `
                <div class="mini-row"><div class="grow"><div class="lr-title" style="font-weight:500">${esc(p.content.slice(0, 70))}…</div><div class="lr-sub">${timeAgo(p.createdAt)}</div></div>${postBadge(p.status)}</div>`).join('') || '<div class="muted small">لا محتوى بعد</div>'}</div></div>
            <div class="card"><div class="card-title mb-2">${icon('activity', 17)} عمليات الحملة (${jobs.length})</div>
              <div class="mini-list" id="cd-jobs">${jobs.slice(0, 10).map(j => {
                const a = appState.accounts.find(x => x.id === j.accountId);
                return `<div class="mini-row"><div class="grow"><div class="lr-title">${JOB_ACTIONS[j.action]} — ${esc(a?.name || '')}</div>
                  ${j.status === 'processing' ? progressRow(j.progress) : j.error ? `<div class="lr-sub text-red">${esc(j.error)}</div>` : `<div class="lr-sub">${timeAgo(j.startedAt)}</div>`}</div>${jobBadge(j.status)}</div>`;
              }).join('') || '<div class="muted small">أطلق الحملة لتوليد المهام</div>'}</div></div>
          </div>
        </div>`;
      if (innerWidth < 1000) document.getElementById('cd-cols').style.gridTemplateColumns = '1fr';
    };
    let deb = null;
    Bus.on('jobs', () => { clearTimeout(deb); deb = setTimeout(render, 300); });
    Bus.on('campaigns', () => { clearTimeout(deb); deb = setTimeout(render, 300); });
    render();
  }
})();
