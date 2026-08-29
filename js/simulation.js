'use strict';
/* ============================================================
   simulation.js — محاكاة محرك التنفيذ (بدون Backend)
   إطلاق حملة → إنشاء مهام → تنفيذ تدريجي → نجاح/فشل → إشعارات
   ============================================================ */

const Engine = {
  timers: {},

  /** إطلاق حملة: تنشئ مهامًا ثم تنفّذها تدريجيًا */
  launchCampaign(id) {
    const c = appState.campaigns.find((x) => x.id === id);
    if (!c || this.timers[id]) return;
    c.status = 'active'; c.progress = 0;
    // إنشاء المهام (Job لكل حساب × إجراءين)
    c.jobsTotal = 0; c.jobsOk = 0; c.jobsFail = 0;
    const newJobs = [];
    c.accountIds.forEach((accId) => {
      ['publish_post', 'sync_account', 'refresh_metrics'].forEach((action, k) => {
        const j = DB.addJob({
          campaignId: id, accountId: accId, action,
          status: 'pending', progress: 0, startedAt: new Date(Date.now() + k * 900).toISOString()
        });
        newJobs.push(j); c.jobsTotal++;
      });
    });
    saveState();
    DB.addNotification({ type: 'campaign_started', title: `بدأت حملة «${c.name}»`, body: `تم إنشاء ${c.jobsTotal} مهمة تنفيذ على ${c.accountIds.length} حسابات` });
    Bus.emit('jobs'); Bus.emit('campaigns');
    toast('أُطلقت الحملة', { body: `جارٍ تنفيذ ${c.jobsTotal} مهمة عبر قائمة الانتظار`, type: 'ok' });

    let done = 0;
    this.timers[id] = setInterval(() => {
      // معالجة دفعة من المهام
      const batch = newJobs.filter((j) => j.status === 'pending').slice(0, 2);
      batch.forEach((j) => {
        j.status = 'processing'; j.progress = 30 + Math.round(Math.random() * 40);
      });
      newJobs.filter((j) => j.status === 'processing').forEach((j) => {
        j.progress = Math.min(100, j.progress + 25 + Math.round(Math.random() * 20));
        if (j.progress >= 100) {
          const fail = Math.random() < 0.09;
          if (fail) {
            j.status = 'failed'; j.error = Math.random() < .5 ? 'انتهت صلاحية رمز الوصول (401)' : 'تجاوز حد الطلبات (429)';
            c.jobsFail++;
            const acc = appState.accounts.find((a) => a.id === j.accountId);
            DB.addError({ category: j.error.includes('401') ? 'authentication' : 'rate_limit', severity: 'medium',
              message: j.error, account: acc?.name || '—', campaign: c.name, jobId: j.id });
            if (appState.settings.notif.jobFail) DB.addNotification({ type: 'job_failed', title: `فشلت عملية في «${c.name}»`, body: j.error });
          } else {
            j.status = 'success'; j.duration = Math.round(1 + Math.random() * 12);
            c.jobsOk++;
            if (j.action === 'publish_post') {
              c.reach += Math.round(1200 + Math.random() * 9000);
              c.impressions += Math.round(1800 + Math.random() * 12000);
              c.engagement += Math.round(80 + Math.random() * 700);
            }
          }
          done++;
        }
      });
      c.progress = Math.round((done / Math.max(1, newJobs.length)) * 100);
      saveState(); Bus.emit('jobs'); Bus.emit('campaigns');
      if (done >= newJobs.length) {
        clearInterval(this.timers[id]); delete this.timers[id];
        if (c.jobsFail === 0 || c.jobsOk > c.jobsFail * 3) {
          if (appState.settings.notif.campaignDone)
            DB.addNotification({ type: 'campaign_completed', title: `اكتملت جولة تنفيذ «${c.name}»`, body: `${c.jobsOk} ناجحة · ${c.jobsFail} فاشلة — معدل نجاح ${Math.round(c.jobsOk / c.jobsTotal * 100)}٪` });
          toast('اكتمل تنفيذ الحملة', { body: c.name, type: 'ok' });
        }
      }
    }, 750);
  },

  pauseCampaign(id) {
    const c = appState.campaigns.find((x) => x.id === id);
    if (!c) return;
    if (this.timers[id]) { clearInterval(this.timers[id]); delete this.timers[id]; }
    c.status = 'paused'; saveState(); Bus.emit('campaigns'); Bus.emit('jobs');
    toast('توقفت الحملة مؤقتًا', { body: c.name, type: 'warn' });
  },

  completeCampaign(id) {
    const c = appState.campaigns.find((x) => x.id === id);
    if (!c) return;
    if (this.timers[id]) { clearInterval(this.timers[id]); delete this.timers[id]; }
    c.status = 'completed'; c.progress = 100; saveState(); Bus.emit('campaigns');
    toast('اكتملت الحملة', { body: c.name, type: 'ok' });
  },

  /** إعادة محاولة مهمة فاشلة */
  retryJob(jobId, onDone) {
    const j = appState.jobs.find((x) => x.id === jobId);
    if (!j) return;
    j.status = 'processing'; j.progress = 15; j.error = null; saveState(); Bus.emit('jobs');
    let steps = 0;
    const t = setInterval(() => {
      j.progress = Math.min(100, j.progress + 30); steps++;
      if (j.progress >= 100 || steps >= 3) {
        clearInterval(t);
        j.status = 'success'; j.progress = 100; j.duration = Math.round(2 + Math.random() * 8); j.error = null;
        saveState(); Bus.emit('jobs');
        toast('نجحت إعادة المحاولة', { body: `${JOB_ACTIONS[j.action]} — مهمة #${j.id}`, type: 'ok' });
        onDone && onDone(true);
      } else Bus.emit('jobs');
      saveState();
    }, 600);
  },

  /** مزامنة حساب */
  syncAccount(id, onDone) {
    const a = appState.accounts.find((x) => x.id === id);
    if (!a) return;
    const old = a.status; a.status = 'connected';
    toast('جارٍ المزامنة…', { body: a.name, type: 'info', duration: 1800 });
    setTimeout(() => {
      a.lastSync = new Date().toISOString(); saveState();
      toast('اكتملت المزامنة', { body: a.name, type: 'ok' });
      onDone && onDone();
    }, 1600);
    a.status = old;
  },

  /** إعادة اتصال حساب */
  reconnectAccount(id, onDone) {
    const a = appState.accounts.find((x) => x.id === id);
    if (!a) return;
    toast('جارٍ إعادة الاتصال عبر OAuth…', { body: a.name, type: 'info', duration: 2000 });
    setTimeout(() => {
      a.status = 'connected'; a.lastSync = new Date().toISOString();
      a.perms = { publish: true, readData: true, insights: true, comments: true, messages: a.platform === 'meta' };
      saveState();
      DB.addNotification({ type: 'account_connected', title: 'تمت إعادة الاتصال بنجاح', body: a.name });
      toast('تمت إعادة الاتصال', { body: a.name, type: 'ok' });
      onDone && onDone();
    }, 2100);
  }
};
