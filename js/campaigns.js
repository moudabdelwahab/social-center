'use strict';
/* campaigns.js — الحملات من Supabase: قائمة + تفاصيل + معالج إنشاء بخطوتين */
(async function () {
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));

  /* ============ القائمة ============ */
  const listRoot = document.getElementById('campaigns-root');
  if (listRoot) {
    let status = new URLSearchParams(location.search).get('status') || '', cache = [];
    async function render() {
      listRoot.innerHTML = '<div class="skeleton" style="min-height:280px"></div>';
      try { cache = await DB.campaigns.list(); } catch (e) { toast(e.message, { type: 'err' }); return; }
      const rows = cache.filter(c => !status || c.status === status);
      listRoot.innerHTML = `
        <div class="between mb-2 wrap">
          <div class="chips">
            <span class="chip ${!status ? 'active' : ''}" onclick="campFilter('')">الكل <span class="n num">${cache.length}</span></span>
            ${Object.entries(CAMP_STATUS).map(([k, m]) => `<span class="chip ${status === k ? 'active' : ''}" onclick="campFilter('${k}')">${m.t} <span class="n num">${cache.filter(c => c.status === k).length}</span></span>`).join('')}
          </div>
          ${can('manager') ? `<button class="btn btn-primary" onclick="openCampaignWizard()">${icon('plus', 15)} إنشاء حملة</button>` : ''}
        </div>
        <div class="camp-grid">
          ${rows.map(c => {
            const pct = c.jobsTotal ? Math.round(c.jobsOk / c.jobsTotal * 100) : 0;
            return `<div class="card hoverable camp-card">
              <div class="cc-head">
                <div class="grow clickable" onclick="location.href='campaign-details.html?id=${c.id}'">
                  <div class="cc-name">${esc(c.name)}</div>
                  <div class="cc-client">${esc(c.client || '')} ${c.objective ? '· ' + esc(c.objective) : ''}</div>
                </div>${campBadge(c.status)}</div>
              <div class="cc-dates"><span>${icon('calendar', 13)} ${fmtDate(c.start_date)} ← ${fmtDate(c.end_date)}</span>
                ${c.budget ? `<span>${icon('wallet', 13)} <span class="num">${fmtFull(c.budget)}</span> ر.س</span>` : ''}</div>
              <div class="camp-kpis"><span>الأصول <b class="num">${c.accountIds.length}</b></span>
                <span>العمليات <b class="num">${c.jobsTotal}</b></span>
                <span>ناجحة <b class="text-green num">${c.jobsOk}</b></span>
                <span>فاشلة <b class="text-red num">${c.jobsFail}</b></span></div>
              ${c.jobsTotal ? progressRow(pct, 'تقدم التنفيذ') : `<div class="tiny muted">لم تبدأ العمليات بعد — مزوّد النشر غير متصل</div>`}
              <div class="cc-foot">
                <div class="flex" style="gap:6px">
                  ${can('manager') && ['draft', 'scheduled', 'paused'].includes(c.status) ? `<button class="btn btn-primary btn-sm" onclick="launchCampaign('${c.id}')">${icon('play', 13)} إطلاق</button>` : ''}
                  ${can('manager') && c.status === 'active' ? `<button class="btn btn-ghost btn-sm" onclick="pauseCampaign('${c.id}')">${icon('pause', 13)} إيقاف</button><button class="btn btn-success btn-sm" onclick="completeCampaign('${c.id}')">${icon('check', 13)} إنهاء</button>` : ''}
                </div>
                <div class="flex" style="gap:6px">
                  <a class="btn btn-ghost btn-sm" href="campaign-details.html?id=${c.id}">فتح</a>
                  ${can('admin') ? `<button class="btn btn-danger btn-sm" onclick="delCampaign('${c.id}')">${icon('trash', 13)}</button>` : ''}
                </div>
              </div></div>`;
          }).join('') || emptyState('target', 'لا حملات هنا', 'أنشئ أول حملة تسويقية للبدء', can('manager') ? `<button class="btn btn-primary" onclick="openCampaignWizard()">${icon('plus', 15)} إنشاء حملة</button>` : '')}
        </div>`;
    }
    window.campFilter = (v) => { status = v; render(); };

    window.launchCampaign = async (id) => {
      const c = cache.find(x => x.id === id);
      if (!c.accountIds.length) return toast('اربط أصولًا بالحملة قبل الإطلاق', { type: 'warn' });
      try {
        await DB.campaigns.update(id, { status: 'active' });
        // إنشاء مهام حقيقية في قاعدة البيانات — تبقى pending حتى يتصل مزوّد النشر
        await DB.jobs.bulkCreate(c.accountIds.flatMap(accId =>
          ['publish_post', 'sync_account', 'refresh_metrics'].map(action => ({ campaign_id: id, account_id: accId, action }))));
        await DB.notifications.create({ type: 'campaign_started', title: `بدأت حملة «${c.name}»`, body: `أُنشئت ${c.accountIds.length * 3} مهمة في قائمة الانتظار` });
        DB.audit('campaign_launched', 'campaign', id);
        toast('أُطلقت الحملة', { body: 'المهام في قائمة الانتظار — مزوّد النشر (Meta) غير متصل بعد', type: 'ok' });
        render();
      } catch (e) { toast(e.message, { type: 'err' }); }
    };
    window.pauseCampaign = async (id) => {
      try {
        await DB.campaigns.update(id, { status: 'paused' });
        const pend = await DB.jobs.list({ campaignId: id, status: 'pending' });
        for (const j of pend) await DB.jobs.update(j.id, { status: 'cancelled' });
        DB.audit('campaign_paused', 'campaign', id);
        toast('توقفت الحملة — أُلغيت المهام المعلّقة', { type: 'warn' }); render();
      } catch (e) { toast(e.message, { type: 'err' }); }
    };
    window.completeCampaign = async (id) => {
      try {
        await DB.campaigns.update(id, { status: 'completed', progress: 100 });
        await DB.notifications.create({ type: 'campaign_completed', title: `اكتملت حملة «${cache.find(x => x.id === id)?.name}»` });
        DB.audit('campaign_completed', 'campaign', id);
        toast('اكتملت الحملة', { type: 'ok' }); render();
      } catch (e) { toast(e.message, { type: 'err' }); }
    };
    window.delCampaign = (id) => {
      const c = cache.find(x => x.id === id);
      confirmDialog({
        message: `حذف حملة <b>${esc(c.name)}</b>؟`, confirmText: 'حذف الحملة',
        onConfirm: async () => {
          try { await DB.campaigns.remove(id); DB.audit('campaign_deleted', 'campaign', id); toast('تم الحذف', { type: 'ok' }); render(); }
          catch (e) { toast(e.message, { type: 'err' }); }
        }
      });
    };

    /* معالج الإنشاء بخطوتين — مع تحقق قبل الانتقال */
    window.openCampaignWizard = async () => {
      const [groups, accs] = await Promise.all([DB.groups.list(), DB.accounts.list()]);
      let campId = null;
      const m = openModal({
        title: 'إنشاء حملة جديدة', sub: 'الخطوة 1 من 2 — معلومات الحملة', size: 'lg',
        body: `<div id="cw-body">
          <div class="form-row">
            <div class="field"><label>اسم الحملة <span class="req">*</span></label><input class="input" id="cw-name" placeholder="مثال: إطلاق المنتج الجديد"></div>
            <div class="field"><label>العميل</label><input class="input" id="cw-client"></div>
          </div>
          <div class="field"><label>الوصف</label><textarea class="textarea" id="cw-desc"></textarea></div>
          <div class="form-row">
            <div class="field"><label>الهدف</label><select class="select" id="cw-obj"><option>زيادة الوعي</option><option>المبيعات</option><option>توليد العملاء</option><option>التفاعل</option><option>زيارات الفرع</option></select></div>
            <div class="field"><label>الميزانية (ر.س)</label><input class="input num" id="cw-budget" type="number" min="0"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>تاريخ البداية <span class="req">*</span></label><input class="input" id="cw-start" type="date"></div>
            <div class="field"><label>تاريخ النهاية <span class="req">*</span></label><input class="input" id="cw-end" type="date"></div>
          </div></div>`,
        actions: `<button class="btn btn-ghost" id="cw-cancel">إلغاء</button><button class="btn btn-primary" id="cw-next">التالي: اختيار الأصول</button>`
      });
      m.el.querySelector('#cw-cancel').onclick = m.close;
      m.el.querySelector('#cw-next').onclick = async () => {
        if (!campId) {
          // تحقق الخطوة 1 — لا انتقال ببيانات ناقصة
          const name = m.el.querySelector('#cw-name').value.trim();
          const st = m.el.querySelector('#cw-start').value, en = m.el.querySelector('#cw-end').value;
          if (!name) return toast('اسم الحملة مطلوب', { type: 'warn' });
          if (!st || !en) return toast('حدّد تاريخي البداية والنهاية', { type: 'warn' });
          if (en < st) return toast('تاريخ النهاية قبل تاريخ البداية', { type: 'warn' });
          const done = btnBusy(m.el.querySelector('#cw-next'));
          try {
            const c = await DB.campaigns.create({
              name, client: m.el.querySelector('#cw-client').value.trim() || null,
              description: m.el.querySelector('#cw-desc').value.trim() || null,
              objective: m.el.querySelector('#cw-obj').value,
              budget: +m.el.querySelector('#cw-budget').value || null,
              start_date: st, end_date: en
            });
            campId = c.id;
            DB.audit('campaign_created', 'campaign', campId);
          } catch (e) { done(); return toast(e.message, { type: 'err' }); }
          done();
          m.el.querySelector('.m-sub').textContent = 'الخطوة 2 من 2 — اختيار الأصول';
          m.el.querySelector('#cw-body').innerHTML = `
            <div class="field"><label>مجموعات كاملة</label><div class="check-list" style="max-height:130px">
              ${groups.map(g => `<label class="check-item"><input type="checkbox" data-gid="${g.id}"><span class="gc-icon" style="background:${g.color};width:26px;height:26px">${icon('folder', 13)}</span>${esc(g.name)}<span class="tiny muted">(${g.members.length})</span></label>`).join('') || '<div class="muted small" style="padding:8px">لا مجموعات</div>'}
            </div></div>
            <div class="field"><label>أو حسابات فردية</label><div class="check-list" style="max-height:170px">
              ${accs.map(a => `<label class="check-item"><input type="checkbox" data-aid="${a.id}">${accAvatar(a, 26)}<span class="grow truncate">${esc(a.name)}</span>${accBadge(a.status)}</label>`).join('') || '<div class="muted small" style="padding:8px">لا حسابات — اربط حسابًا أولًا</div>'}
            </div></div>
            <div class="small muted">تم اختيار <b class="text-brand" id="cw-count">0</b> عنصرًا</div>`;
          m.el.querySelector('#cw-body').addEventListener('change', () => {
            m.el.querySelector('#cw-count').textContent = m.el.querySelectorAll('#cw-body input:checked').length;
          });
          m.el.querySelector('#cw-next').textContent = 'إنشاء الحملة';
          m.el.querySelector('#cw-next').insertAdjacentHTML('afterend', '<button class="btn btn-ghost" id="cw-back">رجوع</button>');
          m.el.querySelector('#cw-back').onclick = () => { m.close(); openCampaignWizard(); };
        } else {
          const gIds = [...m.el.querySelectorAll('[data-gid]:checked')].map(x => x.dataset.gid);
          const aIds = new Set([...m.el.querySelectorAll('[data-aid]:checked')].map(x => x.dataset.aid));
          gIds.forEach(gid => groups.find(g => g.id === gid)?.members.forEach(a => aIds.add(a.id)));
          if (!aIds.size) return toast('اختر أصلًا واحدًا على الأقل', { type: 'warn' });
          const done = btnBusy(m.el.querySelector('#cw-next'));
          try {
            await q(sb.from('campaign_accounts').insert([...aIds].map(a => ({ campaign_id: campId, account_id: a }))), 'assets');
            m.close(); toast(`أُنشئت الحملة ورُبطت ${aIds.size} أصول`, { type: 'ok' });
            location.href = 'campaign-details.html?id=' + campId;
          } catch (e) { toast(e.message, { type: 'err' }); done(); }
        }
      };
    };
    render();
  }

  /* ============ التفاصيل ============ */
  const detRoot = document.getElementById('campaign-detail-root');
  if (detRoot) {
    const id = new URLSearchParams(location.search).get('id');
    async function render() {
      detRoot.innerHTML = '<div class="skeleton" style="min-height:340px"></div>';
      let c;
      try { c = await DB.campaigns.get(id); } catch { detRoot.innerHTML = emptyState('target', 'الحملة غير موجودة', '', '<a class="btn btn-primary" href="campaigns.html">عودة للحملات</a>'); return; }
      const [jobs, posts] = await Promise.all([DB.campaigns.jobsOf(id), DB.campaigns.postsOf(id)]);
      const ok = jobs.filter(j => j.status === 'success').length;
      const fail = jobs.filter(j => j.status === 'failed').length;
      const pct = jobs.length ? Math.round(ok / jobs.length * 100) : 0;
      const stages = ['إنشاء الحملة', 'ربط الأصول', 'إعداد المحتوى', 'الجدولة', 'التنفيذ', 'جمع النتائج'];
      const nowStage = c.status === 'draft' ? (c.assets.length ? 1 : 0) : c.status === 'active' ? 4 : c.status === 'completed' ? 6 : 3;
      detRoot.innerHTML = `
        <div class="card mb-2"><div class="camp-hero">
          <div class="grow">
            <div class="flex wrap" style="gap:10px"><h2>${esc(c.name)}</h2>${campBadge(c.status)}</div>
            <div class="muted small mt-1">${esc(c.client || '')} ${c.objective ? '· الهدف: ' + esc(c.objective) : ''} ${c.budget ? '· الميزانية: <span class="num">' + fmtFull(c.budget) + '</span> ر.س' : ''}</div>
            <div class="cc-dates mt-1">${icon('calendar', 13)} ${fmtDate(c.start_date)} ← ${fmtDate(c.end_date)}</div>
          </div>
          <div class="ch-actions">
            ${can('manager') && ['draft', 'scheduled', 'paused'].includes(c.status) ? `<button class="btn btn-primary btn-sm" onclick="launchCampaign('${c.id}')">${icon('play', 14)} إطلاق الحملة</button>` : ''}
            ${can('manager') && c.status === 'active' ? `<button class="btn btn-ghost btn-sm" onclick="pauseCampaign('${c.id}')">${icon('pause', 14)} إيقاف مؤقت</button><button class="btn btn-success btn-sm" onclick="completeCampaign('${c.id}')">${icon('check', 14)} إنهاء</button>` : ''}
            <a class="btn btn-ghost btn-sm" href="campaign-builder.html">${icon('branch', 14)} منشئ الأتمتة</a>
          </div>
        </div>
        <div class="kpi-inline mt-2">
          <div class="kpi"><div class="kv num">${c.assets.length}</div><div class="kl">الأصول</div></div>
          <div class="kpi"><div class="kv num">${jobs.length}</div><div class="kl">المهام</div></div>
          <div class="kpi"><div class="kv num text-green">${ok}</div><div class="kl">ناجحة</div></div>
          <div class="kpi"><div class="kv num text-red">${fail}</div><div class="kl">فاشلة</div></div>
        </div>
        ${jobs.length ? `<div class="mt-2">${progressRow(pct, `التقدم — ${ok + fail} / ${jobs.length} مهمة`)}</div>
          <div class="form-hint mt-1">${icon('info', 12)} المهام المعلّقة ستُنفَّذ تلقائيًا عند اتصال مزوّد النشر (Meta).</div>` : ''}
        </div>
        <div class="grid" style="grid-template-columns:340px 1fr;align-items:start" id="cd-cols">
          <div class="flex-col">
            <div class="card"><div class="card-title mb-2">${icon('branch', 17)} مخطط سير الحملة</div>
              <div class="flow-steps">${stages.map((s2, i) => `
                <div class="flow-node ${i < nowStage ? 'done' : i === nowStage ? 'now' : ''}">${i < nowStage ? icon('check', 14) : ''}${s2}</div>
                ${i < stages.length - 1 ? '<div class="flow-arrow"></div>' : ''}`).join('')}</div></div>
            <div class="card"><div class="card-title mb-2">${icon('users', 17)} الأصول (${c.assets.length})</div>
              <div class="mini-list">${c.assets.map(a => `
                <div class="mini-row clickable" onclick="location.href='account-details.html?id=${a.id}'">
                  ${accAvatar(a, 30)}<div class="grow"><div class="lr-title truncate">${esc(a.name)}</div><div class="lr-sub">${PLATFORMS[a.platform]?.name || ''}</div></div>${accBadge(a.status)}</div>`).join('') || '<div class="muted small">لم تُربط أصول بعد</div>'}</div></div>
          </div>
          <div class="flex-col">
            <div class="card"><div class="between mb-2"><div class="card-title">${icon('file', 17)} محتوى الحملة (${posts.length})</div>
              <a class="btn btn-ghost btn-sm" href="content.html">${icon('plus', 13)} محتوى جديد</a></div>
              <div class="mini-list">${posts.map(p => `
                <div class="mini-row"><div class="grow"><div class="lr-title" style="font-weight:500">${esc(p.content.slice(0, 70))}…</div><div class="lr-sub">${timeAgo(p.created_at)}</div></div>${postBadge(p.status)}</div>`).join('') || '<div class="muted small">لا محتوى بعد</div>'}</div></div>
            <div class="card"><div class="card-title mb-2">${icon('activity', 17)} عمليات الحملة (${jobs.length})</div>
              <div class="mini-list">${jobs.map(j => `
                <div class="mini-row"><div class="grow"><div class="lr-title">${JOB_ACTIONS[j.action] || j.action} — ${esc(j.social_accounts?.name || '')}</div>
                  ${j.error_message ? `<div class="lr-sub text-red">${esc(j.error_message)}</div>` : `<div class="lr-sub">${timeAgo(j.created_at)}</div>`}</div>${jobBadge(j.status)}</div>`).join('') || '<div class="muted small">أطلق الحملة لتوليد المهام</div>'}</div></div>
          </div>
        </div>`;
      if (innerWidth < 1000) document.getElementById('cd-cols').style.gridTemplateColumns = '1fr';
    }
    window.launchCampaign = async (cid) => {
      try {
        const c2 = await DB.campaigns.get(cid);
        if (!c2.accountIds.length) return toast('اربط أصولًا بالحملة قبل الإطلاق', { type: 'warn' });
        await DB.campaigns.update(cid, { status: 'active' });
        await DB.jobs.bulkCreate(c2.accountIds.flatMap(accId => ['publish_post','sync_account','refresh_metrics'].map(action => ({ campaign_id: cid, account_id: accId, action }))));
        await DB.notifications.create({ type: 'campaign_started', title: `بدأت حملة «${c2.name}»`, body: `أُنشئت ${c2.accountIds.length * 3} مهمة في قائمة الانتظار` });
        DB.audit('campaign_launched', 'campaign', cid);
        toast('أُطلقت الحملة', { body: 'المهام في قائمة الانتظار — مزوّد النشر (Meta) غير متصل بعد', type: 'ok' });
        render();
      } catch (e) { toast(e.message, { type: 'err' }); }
    };
    window.pauseCampaign = async (cid) => {
      try {
        await DB.campaigns.update(cid, { status: 'paused' });
        const pend = await DB.jobs.list({ campaignId: cid, status: 'pending' });
        for (const j of pend) await DB.jobs.update(j.id, { status: 'cancelled' });
        DB.audit('campaign_paused', 'campaign', cid);
        toast('توقفت الحملة — أُلغيت المهام المعلّقة', { type: 'warn' }); render();
      } catch (e) { toast(e.message, { type: 'err' }); }
    };
    window.completeCampaign = async (cid) => {
      try {
        await DB.campaigns.update(cid, { status: 'completed', progress: 100 });
        await DB.notifications.create({ type: 'campaign_completed', title: 'اكتملت الحملة' });
        DB.audit('campaign_completed', 'campaign', cid);
        toast('اكتملت الحملة', { type: 'ok' }); render();
      } catch (e) { toast(e.message, { type: 'err' }); }
    };
    DB.subscribe('jobs', () => render());
    render();
  }
})();
