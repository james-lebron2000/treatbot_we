/**
 * Vanilla Dialog / Toast utilities for the legacy /admin H5.
 * Visual language mirrors the Vue-side AppDialog/AppToast and Landing tokens.
 *
 * Public API (exposed on window.AdminUI):
 *   AdminUI.confirm({ title, content, confirmText, cancelText, danger }) → Promise<boolean>
 *   AdminUI.toast(message, { tone: 'success'|'info'|'warning'|'danger', duration, action }) → void
 *   AdminUI.banner(message, { tone, action }) → returns { dismiss() }
 *
 * Tones map to design tokens:
 *   success → --mint / --mint-soft
 *   info    → --brand / --brand-soft
 *   warning → --amber / --amber-soft
 *   danger  → --red   / --red-soft
 */
(function (global) {
  'use strict';

  function ensureStyles() {
    if (document.getElementById('admin-ui-styles')) return;
    var style = document.createElement('style');
    style.id = 'admin-ui-styles';
    style.textContent = [
      '.admin-ui-mask{position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 160ms ease;font-family:var(--font-sans)}',
      '.admin-ui-mask.show{opacity:1}',
      '.admin-ui-dialog{background:var(--bg);border-radius:var(--r-lg);box-shadow:var(--shadow-2);width:min(420px,calc(100% - 32px));padding:var(--s-6);transform:translateY(8px);transition:transform 160ms ease}',
      '.admin-ui-mask.show .admin-ui-dialog{transform:translateY(0)}',
      '.admin-ui-dialog h3{margin:0 0 var(--s-3);font-size:var(--fs-subtitle);line-height:var(--lh-tight);color:var(--text);font-weight:600}',
      '.admin-ui-dialog p{margin:0;color:var(--text-dim);font-size:var(--fs-body);line-height:var(--lh-relaxed);white-space:pre-line}',
      '.admin-ui-dialog .actions{display:flex;justify-content:flex-end;gap:var(--s-2);margin-top:var(--s-6)}',
      '.admin-ui-dialog button{appearance:none;border:1px solid var(--line);background:var(--bg);color:var(--text);padding:var(--s-2) var(--s-4);border-radius:var(--r-md);font-size:var(--fs-callout);font-family:inherit;cursor:pointer;transition:background 120ms ease,border-color 120ms ease}',
      '.admin-ui-dialog button:hover{background:var(--bg-soft)}',
      '.admin-ui-dialog button.primary{background:var(--brand);color:#fff;border-color:var(--brand)}',
      '.admin-ui-dialog button.primary:hover{background:var(--brand-hover);border-color:var(--brand-hover)}',
      '.admin-ui-dialog button.danger{background:var(--red);color:#fff;border-color:var(--red)}',
      '.admin-ui-dialog button.danger:hover{filter:brightness(0.94)}',
      '.admin-ui-dialog button:focus-visible{outline:none;box-shadow:var(--shadow-focus)}',
      '.admin-ui-toast-stack{position:fixed;top:var(--s-4);left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:var(--s-2);z-index:10000;pointer-events:none;font-family:var(--font-sans)}',
      '.admin-ui-toast{pointer-events:auto;display:flex;align-items:center;gap:var(--s-3);background:var(--bg);border:1px solid var(--line);border-left:3px solid var(--brand);border-radius:var(--r-md);box-shadow:var(--shadow-2);padding:var(--s-3) var(--s-4);font-size:var(--fs-callout);color:var(--text);min-width:240px;max-width:480px;transform:translateY(-8px);opacity:0;transition:opacity 160ms ease,transform 160ms ease}',
      '.admin-ui-toast.show{opacity:1;transform:translateY(0)}',
      '.admin-ui-toast.tone-success{border-left-color:var(--mint);background:var(--mint-soft);color:var(--mint-text)}',
      '.admin-ui-toast.tone-warning{border-left-color:var(--amber);background:var(--amber-soft);color:var(--amber-text)}',
      '.admin-ui-toast.tone-danger{border-left-color:var(--red);background:var(--red-soft);color:var(--red-text)}',
      '.admin-ui-toast button{margin-left:auto;background:transparent;border:0;color:inherit;font-weight:600;cursor:pointer;font-family:inherit;font-size:inherit;padding:var(--s-1) var(--s-2);border-radius:var(--r-sm)}',
      '.admin-ui-toast button:hover{background:rgba(15,23,42,0.06)}',
      '.admin-ui-banner{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:var(--s-3);padding:var(--s-3) var(--s-4);background:var(--brand-soft);color:var(--text);border-bottom:1px solid var(--line);font-family:var(--font-sans);font-size:var(--fs-callout)}',
      '.admin-ui-banner.tone-warning{background:var(--amber-soft);color:var(--amber-text)}',
      '.admin-ui-banner.tone-danger{background:var(--red-soft);color:var(--red-text)}',
      '.admin-ui-banner.tone-success{background:var(--mint-soft);color:var(--mint-text)}',
      '.admin-ui-banner button{margin-left:auto;border:1px solid currentColor;background:transparent;color:inherit;border-radius:var(--r-md);padding:var(--s-1) var(--s-3);font-family:inherit;font-size:inherit;cursor:pointer;font-weight:600}',
      '.admin-ui-banner button:hover{background:rgba(15,23,42,0.05)}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureToastStack() {
    var stack = document.getElementById('admin-ui-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'admin-ui-toast-stack';
      stack.className = 'admin-ui-toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function confirm(opts) {
    ensureStyles();
    var o = opts || {};
    return new Promise(function (resolve) {
      var mask = document.createElement('div');
      mask.className = 'admin-ui-mask';

      var dialog = document.createElement('div');
      dialog.className = 'admin-ui-dialog';
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');

      var title = document.createElement('h3');
      title.textContent = o.title || '请确认';

      var body = document.createElement('p');
      body.textContent = o.content || '';

      var actions = document.createElement('div');
      actions.className = 'actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = o.cancelText || '取消';

      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = o.confirmText || '确认';
      okBtn.className = o.danger ? 'danger' : 'primary';

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      dialog.appendChild(title);
      dialog.appendChild(body);
      dialog.appendChild(actions);
      mask.appendChild(dialog);
      document.body.appendChild(mask);

      requestAnimationFrame(function () { mask.classList.add('show'); });

      function close(value) {
        mask.classList.remove('show');
        setTimeout(function () { mask.remove(); }, 180);
        resolve(value);
      }

      cancelBtn.addEventListener('click', function () { close(false); });
      okBtn.addEventListener('click', function () { close(true); });
      mask.addEventListener('click', function (event) {
        if (event.target === mask) close(false);
      });

      function onKey(event) {
        if (event.key === 'Escape') { close(false); document.removeEventListener('keydown', onKey); }
        else if (event.key === 'Enter') { close(true); document.removeEventListener('keydown', onKey); }
      }
      document.addEventListener('keydown', onKey);

      setTimeout(function () { okBtn.focus(); }, 60);
    });
  }

  function toast(message, options) {
    ensureStyles();
    var stack = ensureToastStack();
    var opts = options || {};
    var tone = opts.tone || 'info';
    var node = document.createElement('div');
    node.className = 'admin-ui-toast tone-' + tone;
    var text = document.createElement('span');
    text.textContent = message;
    node.appendChild(text);

    var dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      node.classList.remove('show');
      setTimeout(function () { node.remove(); }, 200);
    }

    if (opts.action && typeof opts.action.onClick === 'function') {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opts.action.text || '操作';
      btn.addEventListener('click', function () {
        try { opts.action.onClick(); } catch (e) {}
        dismiss();
      });
      node.appendChild(btn);
    }

    stack.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('show'); });

    var duration = typeof opts.duration === 'number' ? opts.duration : (tone === 'danger' || tone === 'warning' ? 3600 : 2400);
    if (duration > 0) setTimeout(dismiss, duration);
    return { dismiss: dismiss };
  }

  function banner(message, options) {
    ensureStyles();
    var opts = options || {};
    var node = document.createElement('div');
    node.className = 'admin-ui-banner tone-' + (opts.tone || 'info');
    var text = document.createElement('span');
    text.textContent = message;
    node.appendChild(text);

    if (opts.action && typeof opts.action.onClick === 'function') {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opts.action.text || '查看';
      btn.addEventListener('click', opts.action.onClick);
      node.appendChild(btn);
    }

    var host = opts.target || document.body;
    if (host === document.body) host.insertBefore(node, host.firstChild);
    else host.appendChild(node);

    return { dismiss: function () { node.remove(); } };
  }

  global.AdminUI = { confirm: confirm, toast: toast, banner: banner };
})(window);
