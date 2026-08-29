'use strict';
/* ============================================================
   mock-data.js — بيانات تجريبية واقعية (تُزرع مرة واحدة)
   الأوقات تُحسب نسبةً إلى لحظة الزرع لتبدو حيّة دائمًا
   ============================================================ */

const SEED = (() => {
  const now = Date.now();
  const m = (x) => new Date(now - x * 6e4).toISOString();
  const h = (x) => new Date(now - x * 36e5).toISOString();
  const d = (x) => new Date(now - x * 864e5).toISOString();
  const futD = (x) => new Date(now + x * 864e5).toISOString().slice(0, 10);
  const pastD = (x) => new Date(now - x * 864e5).toISOString().slice(0, 10);
  // مولّد شبه عشوائي ثابت لبيانات الرسوم
  let _s = 42;
  const rnd = () => { _s = (_s * 16807) % 2147483647; return (_s % 1000) / 1000; };

  const PLATFORMS = {
    meta:      { name: 'فيسبوك',   color: '#1877f2', short: 'f' },
    instagram: { name: 'إنستغرام', color: '#e1306c', short: 'ig' },
    tiktok:    { name: 'تيك توك',  color: '#111',    short: 'tt' },
    linkedin:  { name: 'لينكدإن',  color: '#0a66c2', short: 'in' }
  };

  const accounts = [
    [1,'متجر لمسة للعطور','@lamsa.perfumes','meta','page','connected',48200,15],
    [2,'لمسة للعطور — إنستغرام','@lamsa.perfumes','instagram','business','connected',91500,15],
    [3,'مطعم بيت المشاوي','@baytalmashawi','meta','page','connected',22400,40],
    [4,'بيت المشاوي','@baytalmashawi','instagram','business','connected',37800,40],
    [5,'عيادات سمايل لطب الأسنان','@smile.clinics','meta','page','reconnect',15600,3*1440],
    [6,'سمايل كلينك','@smileclinics','instagram','business','connected',28900,50],
    [7,'أكاديمية تعلّم الرقمية','@taalum.academy','meta','page','connected',61300,20],
    [8,'تعلّم أكاديمي','@taalum','tiktok','business','connected',142000,25],
    [9,'عقارات الديار','@aldiyar.re','meta','page','error',9400,2*1440],
    [10,'الديار العقارية','@aldiyar-re','linkedin','business','connected',7200,60],
    [11,'كافيه روّاد','@rawad.cafe','instagram','business','connected',19300,30],
    [12,'روّاد كافيه','@rawadcafe','tiktok','business','reconnect',55600,26*60],
    [13,'متجر تقنية بلس','@techplus.store','meta','page','connected',33800,18],
    [14,'تقنية بلس','@techplus','tiktok','business','connected',88100,22],
    [15,'صالة أيرون للياقة','@iron.gym','instagram','business','connected',24700,35],
    [16,'أيرون جيم','@irongym','meta','page','paused',11200,5*1440],
    [17,'مكتبة المعرفة','@almaarifa.books','meta','page','connected',17600,44],
    [18,'شركة آفاق للاستشارات','@afaq.consulting','linkedin','business','connected',5900,70],
    [19,'متجر زهور الربيع','@springflowers','instagram','business','error',13400,30*60],
    [20,'سفر وسياحة — رحلاتنا','@rehlatna','meta','page','connected',41600,12]
  ].map(([id, name, handle, platform, type, status, followers, minsAgo], i) => ({
    id, name, handle, platform, type, status, followers,
    lastSync: m(minsAgo), addedAt: d(20 + i * 3),
    perms: { publish: status !== 'error', readData: true, insights: status === 'connected', comments: status === 'connected', messages: platform === 'meta' && status === 'connected' },
    campaigns: []
  }));

  const groups = [
    { id: 1, name: 'عملاء قطاع التجزئة', desc: 'متاجر وعلامات تجارية', color: '#6d8dff', accountIds: [1, 2, 13, 14, 19] },
    { id: 2, name: 'مطاعم وضيافة', desc: 'مطاعم ومقاهي', color: '#2fbf8f', accountIds: [3, 4, 11, 12] },
    { id: 3, name: 'صحة ولياقة', desc: 'عيادات وصالات رياضية', color: '#f0566d', accountIds: [5, 6, 15, 16] },
    { id: 4, name: 'حملة سبتمبر الكبرى', desc: 'كل الأصول المشاركة في حملة الشهر', color: '#eda33c', accountIds: [1, 2, 7, 8, 13, 14, 20] },
    { id: 5, name: 'حسابات الشركة الخاصة', desc: 'أصولنا الداخلية', color: '#a78bfa', accountIds: [7, 8, 18] }
  ];

  const campaigns = [
    { id: 1, name: 'إطلاق تشكيلة العطور الجديدة', client: 'متجر لمسة', objective: 'زيادة الوعي', status: 'active', start: pastD(6), end: futD(9), budget: 15000, accountIds: [1, 2, 19], progress: 68, jobsTotal: 120, jobsOk: 112, jobsFail: 8, reach: 284500, engagement: 19800, impressions: 401200 },
    { id: 2, name: 'عروض نهاية الأسبوع', client: 'بيت المشاوي', objective: 'المبيعات', status: 'active', start: pastD(2), end: futD(2), budget: 4500, accountIds: [3, 4], progress: 41, jobsTotal: 48, jobsOk: 44, jobsFail: 2, reach: 96200, engagement: 8400, impressions: 128000 },
    { id: 3, name: 'حملة العودة للمدارس', client: 'مكتبة المعرفة', objective: 'المبيعات', status: 'active', start: pastD(4), end: futD(12), budget: 8000, accountIds: [17, 7, 8], progress: 55, jobsTotal: 90, jobsOk: 85, jobsFail: 3, reach: 173000, engagement: 12100, impressions: 219400 },
    { id: 4, name: 'توعية صحية — الفحص المبكر', client: 'عيادات سمايل', objective: 'زيادة الوعي', status: 'scheduled', start: futD(3), end: futD(17), budget: 6000, accountIds: [5, 6], progress: 0, jobsTotal: 0, jobsOk: 0, jobsFail: 0, reach: 0, engagement: 0, impressions: 0 },
    { id: 5, name: 'افتتاح فرع تقنية بلس الجديد', client: 'تقنية بلس', objective: 'زيارات الفرع', status: 'scheduled', start: futD(6), end: futD(13), budget: 12000, accountIds: [13, 14], progress: 0, jobsTotal: 0, jobsOk: 0, jobsFail: 0, reach: 0, engagement: 0, impressions: 0 },
    { id: 6, name: 'خصومات الصيف الأخيرة', client: 'زهور الربيع', objective: 'المبيعات', status: 'paused', start: pastD(9), end: futD(1), budget: 3200, accountIds: [19], progress: 73, jobsTotal: 36, jobsOk: 30, jobsFail: 6, reach: 41800, engagement: 2900, impressions: 55400 },
    { id: 7, name: 'برنامج الولاء — أيرون جيم', client: 'صالة أيرون', objective: 'الاحتفاظ بالعملاء', status: 'draft', start: '', end: '', budget: null, accountIds: [15, 16], progress: 0, jobsTotal: 0, jobsOk: 0, jobsFail: 0, reach: 0, engagement: 0, impressions: 0 },
    { id: 8, name: 'حملة عروض رمضان المبكرة', client: 'الديار العقارية', objective: 'توليد العملاء', status: 'completed', start: pastD(30), end: pastD(4), budget: 22000, accountIds: [9, 10, 18], progress: 100, jobsTotal: 210, jobsOk: 198, jobsFail: 12, reach: 512000, engagement: 38600, impressions: 689000 }
  ];
  campaigns.forEach((c) => c.accountIds.forEach((a) => { const acc = accounts.find((x) => x.id === a); if (acc) acc.campaigns.push(c.id); }));

  const postTexts = [
    '✨ وصلت التشكيلة الجديدة! عطور شرقية فاخرة بثبات يدوم طوال اليوم. اطلب الآن واحصل على خصم الإطلاق ٢٠٪',
    'جمعة ومشاوي؟ المعادلة المثالية 🔥 احجز طاولتك لعطلة نهاية الأسبوع — الأماكن محدودة',
    'ابتسامتك تستحق الأفضل 🤍 احجز جلسة تنظيف الأسنان هذا الأسبوع واحصل على فحص مجاني',
    'خصم ٣٠٪ على جميع الأدوات المدرسية والحقائب 🎒 العرض ساري حتى نهاية الأسبوع',
    'نصيحة اليوم: ٣ عادات بسيطة تحافظ على صحة أسنانك مدى الحياة. احفظ المنشور وشاركه مع من تحب',
    'شقة أحلامك بانتظارك 🏡 عروض حصرية على مشاريعنا الجديدة — تواصل معنا لجولة معاينة مجانية',
    'قهوتك المفضلة بانتظارك ☕ جرب مشروبنا الموسمي الجديد — لاتيه التمر بالهيل',
    'جديدنا: أحدث الأجهزة بأسعار لن تتكرر 📱 تسوق الآن مع شحن مجاني لجميع المدن',
    'لا تؤجل لياقتك! اشترك هذا الشهر واحصل على أسبوعين مجانًا مع مدرب شخصي 💪',
    'عرض خاص: باقة الزهور الأسبوعية لمكتبك أو منزلك بتوصيل مجاني 🌸'
  ];
  const posts = [];
  for (let i = 1; i <= 30; i++) {
    const c = campaigns[(i * 3) % campaigns.length];
    const st = i % 5 === 0 ? 'draft' : i % 3 === 0 ? 'scheduled' : 'published';
    posts.push({
      id: i, content: postTexts[i % postTexts.length] + (i > 10 ? ' — نسخة ' + i : ''),
      campaignId: c.id, status: st,
      accountIds: c.accountIds.slice(0, 2),
      scheduledAt: st === 'scheduled' ? new Date(now + (i % 4 + 1) * 36e5 * 5).toISOString() : null,
      publishedAt: st === 'published' ? h(i * 3) : null,
      reach: st === 'published' ? Math.round(4000 + rnd() * 42000) : 0,
      engagement: st === 'published' ? Math.round(200 + rnd() * 3200) : 0,
      createdAt: d(i)
    });
  }

  const JOB_ACTIONS = ['publish_post', 'sync_account', 'refresh_metrics'];
  const jobs = [];
  for (let i = 1; i <= 50; i++) {
    const c = campaigns[i % 3]; // الحملات النشطة
    const acc = accounts.find((a) => c.accountIds.includes(a.id)) || accounts[0];
    const st = i % 11 === 0 ? 'failed' : i % 7 === 0 ? 'processing' : i % 5 === 0 ? 'pending' : 'success';
    jobs.push({
      id: 1000 + i, campaignId: c.id, accountId: acc.id,
      action: JOB_ACTIONS[i % 3], status: st,
      progress: st === 'processing' ? Math.round(20 + rnd() * 60) : st === 'success' ? 100 : st === 'failed' ? 100 : 0,
      startedAt: h(i / 2), duration: st === 'success' ? Math.round(1 + rnd() * 14) : null,
      error: st === 'failed' ? 'انتهت صلاحية رمز الوصول (401)' : null
    });
  }

  const notifications = [
    { id: 1, type: 'campaign_started', title: 'بدأت حملة «إطلاق تشكيلة العطور الجديدة»', body: 'تم إنشاء 120 مهمة تنفيذ على 3 حسابات', time: m(8), read: false },
    { id: 2, type: 'job_failed', title: 'فشل نشر منشور على «عقارات الديار»', body: 'انتهت صلاحية رمز الوصول — يلزم إعادة الاتصال', time: m(25), read: false },
    { id: 3, type: 'job_failed', title: 'فشلت مزامنة «زهور الربيع»', body: 'تجاوز حد الطلبات (429) — ستتم إعادة المحاولة تلقائيًا', time: m(52), read: false },
    { id: 4, type: 'account_connected', title: 'تم ربط حساب جديد', body: 'سفر وسياحة — رحلاتنا (فيسبوك)', time: h(3), read: true },
    { id: 5, type: 'campaign_completed', title: 'اكتملت حملة «عروض رمضان المبكرة»', body: 'معدل نجاح 94٪ — 512 ألف وصول إجمالي', time: h(7), read: true },
    { id: 6, type: 'token_expiring', title: 'صلاحية اتصال «عيادات سمايل» تنتهي قريبًا', body: 'ينصح بإعادة الاتصال قبل انتهاء الرمز', time: h(12), read: true },
    { id: 7, type: 'post_published', title: 'نُشر منشور مجدول بنجاح', body: 'حملة العودة للمدارس — مكتبة المعرفة', time: h(20), read: true },
    { id: 8, type: 'report_ready', title: 'تقرير الأسبوع الماضي جاهز', body: 'الوصول ارتفع 18٪ مقارنة بالأسبوع السابق', time: d(1), read: true }
  ];

  const errors = [
    { id: 1, category: 'authentication', severity: 'high', message: 'انتهت صلاحية رمز الوصول للحساب', account: 'عقارات الديار', campaign: 'عروض رمضان المبكرة', time: m(25), occurrences: 3, status: 'open', jobId: 1011 },
    { id: 2, category: 'rate_limit', severity: 'medium', message: 'تجاوز حد الطلبات للمنصة (HTTP 429)', account: 'زهور الربيع', campaign: 'خصومات الصيف الأخيرة', time: m(52), occurrences: 7, status: 'open', jobId: 1022 },
    { id: 3, category: 'network', severity: 'low', message: 'انقطاع مؤقت في الشبكة أثناء النشر', account: 'روّاد كافيه', campaign: '—', time: h(2), occurrences: 1, status: 'open', jobId: 1033 },
    { id: 4, category: 'permission', severity: 'high', message: 'صلاحية «إدارة الرسائل» غير ممنوحة', account: 'عيادات سمايل لطب الأسنان', campaign: 'توعية صحية', time: h(5), occurrences: 2, status: 'open', jobId: null },
    { id: 5, category: 'api', severity: 'medium', message: 'خطأ مؤقت في خوادم المنصة (500)', account: 'تقنية بلس', campaign: 'افتتاح الفرع الجديد', time: h(9), occurrences: 4, status: 'open', jobId: 1044 },
    { id: 6, category: 'authentication', severity: 'high', message: 'تم إبطال رمز الوصول من المنصة', account: 'عقارات الديار', campaign: '—', time: h(14), occurrences: 1, status: 'resolved', jobId: null },
    { id: 7, category: 'validation', severity: 'low', message: 'محتوى المنشور تجاوز الحد الأقصى للأحرف', account: 'مكتبة المعرفة', campaign: 'العودة للمدارس', time: d(1), occurrences: 2, status: 'resolved', jobId: null },
    { id: 8, category: 'network', severity: 'medium', message: 'مهلة الاتصال انتهت أثناء جلب الإحصائيات', account: 'أيرون جيم', campaign: '—', time: d(1), occurrences: 5, status: 'open', jobId: 1045 },
    { id: 9, category: 'rate_limit', severity: 'low', message: 'تباطؤ معدل الطلبات — تم التأجيل التلقائي', account: 'تعلّم أكاديمي', campaign: 'حملة سبتمبر', time: d(2), occurrences: 12, status: 'resolved', jobId: null },
    { id: 10, category: 'api', severity: 'medium', message: 'استجابة غير متوقعة من واجهة المنصة', account: 'سمايل كلينك', campaign: '—', time: d(2), occurrences: 2, status: 'resolved', jobId: null }
  ];

  // سلسلة 30 يومًا للتحليلات
  const series30 = [];
  for (let i = 29; i >= 0; i--) {
    const base = 14000 + Math.sin(i / 4.5) * 5200 + rnd() * 6800 + (29 - i) * 260;
    series30.push({
      date: pastD(i), reach: Math.round(base),
      impressions: Math.round(base * 1.42),
      engagement: Math.round(base * (0.06 + rnd() * 0.03)),
      success: Math.round(34 + rnd() * 26), failed: Math.round(rnd() * 6)
    });
  }

  return { accounts, groups, campaigns, posts, jobs, notifications, errors, series30, platforms: PLATFORMS };
})();
