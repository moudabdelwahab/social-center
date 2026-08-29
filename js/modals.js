'use strict';
/* ============================================================
   modals.js — نظام النوافذ المنبثقة + التنبيهات (Toasts)
   ============================================================ */

function openModal({ title = '', sub = '', body = '', actions = '', size = '' }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.innerHTML = `
    <div class="modal ${size}">
      <div class="modal-head">
        <div><h3>${title}</h3>${sub ? `<div class="m-sub">${sub}</div>` : ''}</div>
        <button class="modal-close" aria-label="إغلاق">${icon('x', 15)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions ? `<div class="modal-actions">${actions}</div>` : ''}
    </div>`;
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  const close = () => {
    back.classList.remove('show');
    setTimeout(() => { back.remove(); if (!$('.modal-back')) document.body.style.overflow = ''; }, 200);
  };
  back.querySelector('.modal-close').onclick = close;
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  const escH = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escH); } };
  document.addEventListener('keydown', escH);
  requestAnimationFrame(() => back.classList.add('show'));
  const first = back.querySelector('input,select,textarea,button:not(.modal-close)');
  if (first) setTimeout(() => first.focus(), 120);
  return { el: back, close };
}

function confirmDialog({ title = 'تأكيد العملية', message, confirmText = 'تأكيد', danger = true, onConfirm }) {
  const m = openModal({
    title, size: 'sm',
    body: `<p style="font-size:13.5px;line-height:1.9">${message}</p>`,
    actions: `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cd-yes">${confirmText}</button>
              <button class="btn btn-ghost" id="cd-no">إلغاء</button>`
  });
  m.el.querySelector('#cd-yes').onclick = () => { m.close(); onConfirm && onConfirm(); };
  m.el.querySelector('#cd-no').onclick = m.close;
}

function toast(title, { body = '', type = 'info', duration = 4200 } = {}) {
  const icons = { ok: 'check-circle', err: 'alert', info: 'bell', warn: 'alert' };
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="t-ico">${icon(icons[type] || 'bell', 15)}</div>
    <div class="grow"><div class="t-title">${esc(title)}</div>${body ? `<div class="t-body">${esc(body)}</div>` : ''}</div>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, duration);
}
