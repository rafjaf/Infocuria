(() => {
  const BI = globalThis.BetterInfocuria;

  const STATE = {
    lastPreviewSig: '',
    lastDocData: null,
    scheduled: false,
    suppressUntil: 0,
  };

  function now() {
    return Date.now();
  }

  function getPreviewRoot() {
    try {
      if (typeof BI.getPreviewRoot === 'function') return BI.getPreviewRoot();
      if (typeof BI.getDocumentPreviewRoot === 'function') return BI.getDocumentPreviewRoot();
    } catch {
      // ignore
    }
    return document.querySelector('#panel-document-preview');
  }

  function computePreviewSig(previewRoot) {
    if (!previewRoot) return '';
    const header = previewRoot.querySelector('h1,h2,h3')?.textContent || '';
    const firstP = previewRoot.querySelector('p')?.textContent || '';
    return `${BI.normalizeSpaces(header).slice(0, 120)}|${BI.normalizeSpaces(firstP).slice(0, 120)}`;
  }

  function getSelectionText() {
    const sel = window.getSelection();
    return sel ? String(sel.toString() || '') : '';
  }

  function getParagraphForSelection(previewRoot) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode;
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    if (!el) return null;

    // Legacy behavior from content.js: try to extract a leading paragraph number ("point")
    // from the selection container; if not found, fall back to closest <p>.
    const extractFromText = (text) => {
      const m = String(text || '').match(/^\s*(\d+)\b/);
      return m?.[1] ? Number(m[1]) : null;
    };

    let targetEl = el;
    if (previewRoot && !previewRoot.contains(targetEl)) return null;

    let num = extractFromText(targetEl.innerText || targetEl.textContent);
    if (num == null) {
      const dd = targetEl.closest('dd');
      if (dd && (!previewRoot || previewRoot.contains(dd))) {
        const dt = dd.previousElementSibling;
        if (dt && dt.tagName === 'DT') {
          num = extractFromText(dt.innerText || dt.textContent);
          if (num != null) return { number: num, element: dd };
        }
      }
    }
    if (num == null) {
      const p = targetEl.closest('p');
      if (!p) return null;
      if (previewRoot && !previewRoot.contains(p)) return null;
      num = extractFromText(p.innerText || p.textContent);
      if (num == null) return null;
      return { number: num, element: p };
    }

    const p = targetEl.closest('p');
    return { number: num, element: p || targetEl };
  }

  function ensureToast() {
    let t = document.getElementById('ih-toast');
    if (t) return t;
    t = document.createElement('div');
    t.id = 'ih-toast';
    t.className = 'ih-toast';
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
    return t;
  }

  function toast(msg) {
    const t = ensureToast();
    t.textContent = msg;
    t.classList.add('ih-toast-visible');
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => {
      t.classList.remove('ih-toast-visible');
    }, 1200);
  }

  function update() {
    STATE.scheduled = false;

    try {
      if (now() < STATE.suppressUntil) return;

      const previewRoot = getPreviewRoot();
      const hasPreview = Boolean(previewRoot) && (!BI.isVisible || BI.isVisible(previewRoot));

      // Hide (and avoid creating) the panel unless a judgment is actually selected.
      if (!hasPreview || typeof BI.buildDocData !== 'function') {
        const existing = document.getElementById('infocuria-helper');
        if (existing) BI.setPanelHidden(true);
        STATE.lastPreviewSig = '';
        STATE.lastDocData = null;
        return;
      }

      const docProbe = BI.buildDocData(previewRoot);
      const looksLikeJudgment = Boolean(docProbe?.caseNumber) && Boolean(docProbe?.date);
      if (!looksLikeJudgment) {
        const existing = document.getElementById('infocuria-helper');
        if (existing) BI.setPanelHidden(true);
        STATE.lastPreviewSig = '';
        STATE.lastDocData = null;
        return;
      }

      const panel = BI.ensurePanel();
      BI.setPanelHidden(false);

      BI.ensureDockedLayout(panel);
      if (typeof BI.ensureDockedTopSync === 'function') {
        BI.ensureDockedTopSync(panel, getPreviewRoot);
      }

      const sig = computePreviewSig(previewRoot);
      const sigChanged = sig && sig !== STATE.lastPreviewSig;

      if (sigChanged) {
        STATE.lastPreviewSig = sig;

        const doc = docProbe;
        STATE.lastDocData = doc;

        BI.setCitationHtml(panel, doc?.citationHtml || '');

        const tocItems = BI.buildTocItems(previewRoot);
        BI.setTocItems(panel, tocItems, getPreviewRoot);

        // Apply highlights / ECLI links in the preview (idempotent)
        STATE.suppressUntil = now() + 50;
        BI.linkifyEcli(previewRoot);
      }

      BI.attachPanelHandlers(panel, {
        getDocData: () => STATE.lastDocData,
        getSelectionText,
        getParagraphForSelection: () => getParagraphForSelection(previewRoot),
        onToast: toast,
      });
    } catch (err) {
      // Don't let one exception permanently break updates.
      // eslint-disable-next-line no-console
      console.error('Better Infocuria: update failed', err);
    }
  }

  function scheduleUpdate(reason) {
    void reason;
    if (STATE.scheduled) return;
    STATE.scheduled = true;
    window.requestAnimationFrame(update);
  }

  function initObserver() {
    if (window.__ihObserverBound) return;
    window.__ihObserverBound = true;

    const mo = new MutationObserver(() => scheduleUpdate('mutation'));
    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: false,
      attributes: false,
    });

    window.addEventListener('popstate', () => scheduleUpdate('popstate'));
    window.addEventListener('hashchange', () => scheduleUpdate('hashchange'));
  }

  function initCopyInterceptor() {
    if (window.__ihCopyInterceptorBound) return;
    window.__ihCopyInterceptorBound = true;

    document.addEventListener('copy', (e) => {
      try {
        const sel = window.getSelection();
        const selectedText = sel ? String(sel.toString() || '') : '';
        if (!selectedText) return;

        const previewRoot = getPreviewRoot();
        if (!previewRoot) return;

        // Only hijack copy inside the judgment preview.
        const anchorNode = sel?.anchorNode;
        const anchorEl = anchorNode && (anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement);
        if (!anchorEl || !previewRoot.contains(anchorEl)) return;

        const doc = STATE.lastDocData || (typeof BI.buildDocData === 'function' ? BI.buildDocData(previewRoot) : null);
        if (!doc?.citationText || !doc?.citationHtml) return;

        const para = getParagraphForSelection(previewRoot);
        const payload = typeof BI.buildCopyPayload === 'function'
          ? BI.buildCopyPayload(doc, selectedText, para?.number)
          : null;
        if (!payload) return;

        // Best-effort: use the event clipboardData so paste picks HTML immediately.
        if (e.clipboardData) {
          e.preventDefault();
          e.clipboardData.setData('text/plain', payload.plain);
          e.clipboardData.setData('text/html', payload.html);
          return;
        }

        // Fallback (async clipboard API)
        e.preventDefault();
        if (typeof BI.writeClipboardPayload === 'function') {
          void BI.writeClipboardPayload(payload);
        } else {
          void navigator.clipboard.writeText(payload.plain);
        }
      } catch {
        // ignore
      }
    });
  }

  function showUpdateBanner(version) {
    if (!document.body || document.getElementById('ih-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'ih-update-banner';
    banner.className = 'ih-update-banner';

    const text = document.createElement('div');
    text.className = 'ih-update-banner-text';
    text.textContent = `Better Infocuria updated${version ? ` to v${version}` : ''}.`;

    const link = document.createElement('a');
    link.className = 'ih-update-banner-link';
    link.href = 'https://github.com/rafjaf/Infocuria';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'See what changed';

    const close = document.createElement('button');
    close.className = 'ih-update-banner-close';
    close.type = 'button';
    close.textContent = 'Dismiss';
    close.addEventListener('click', () => banner.remove());

    const left = document.createElement('div');
    left.className = 'ih-update-banner-left';
    left.appendChild(text);
    left.appendChild(link);

    banner.appendChild(left);
    banner.appendChild(close);
    document.body.appendChild(banner);

    window.requestAnimationFrame(() => banner.classList.add('ih-update-banner-visible'));
    window.setTimeout(() => banner.remove(), 8000);
  }

  function initUpdateBanner() {
    if (window.top !== window) return;
    if (window.__ihUpdateBannerBound) return;
    window.__ihUpdateBannerBound = true;

    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === 'ih-show-update-banner') {
          showUpdateBanner(msg.version);
        }
      });
    }

    if (chrome?.storage?.local) {
      chrome.storage.local.get('ihUpdateBanner', (res) => {
        const payload = res?.ihUpdateBanner;
        if (payload?.version) {
          showUpdateBanner(payload.version);
          chrome.storage.local.remove('ihUpdateBanner');
        }
      });
    }
  }

  function init() {
    initObserver();
    initCopyInterceptor();
    initUpdateBanner();
    scheduleUpdate('init');

    // Extra kick for SPA layouts that mount late.
    window.setTimeout(() => scheduleUpdate('init-timeout'), 600);
  }

  init();
})();
