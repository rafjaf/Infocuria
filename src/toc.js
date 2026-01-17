(() => {
  const BI = globalThis.BetterInfocuria;

  function getScrollContainerForPreview(previewRoot) {
    if (!previewRoot) return null;
    const isScrollable = (el) => {
      if (!el) return false;
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch {
        return false;
      }
      const overflowY = (cs?.overflowY || '').toLowerCase();
      const canScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
      return canScroll && el.scrollHeight > el.clientHeight + 2;
    };

    if (isScrollable(previewRoot)) return previewRoot;

    const candidates = [
      previewRoot.querySelector('#document-viewer-content.preview-content'),
      previewRoot.querySelector('#document-viewer-content'),
      previewRoot.querySelector('[data-testid="document-viewer-content"]'),
      previewRoot.querySelector('.preview-content'),
    ].filter(Boolean);

    for (const el of candidates) {
      if (isScrollable(el)) return el;
    }

    return previewRoot;
  }

  function inferHeadingLevelFromClass(p) {
    if (!p) return null;
    const className = p.className || '';
    const m = className.match(/\bC\d{2}Titre(\d+)\b/);
    if (m) return Number(m[1]);
    const m2 = className.match(/\bTitre(\d+)\b/);
    if (m2) return Number(m2[1]);
    return null;
  }

  function normalizeHeadingText(s) {
    return BI.normalizeSpaces(String(s || '')).replace(/\s*:\s*$/u, '').trim();
  }

  function findHeadingCandidates(previewRoot) {
    if (!previewRoot) return [];

    const paras = Array.from(previewRoot.querySelectorAll('p'));

    const headingPatterns = [
      /^Le cadre juridique$/i,
      /^Les litiges au principal/i,
      /^Sur les questions préjudicielles/i,
      /^Sur la/i,
      /^Sur le/i,
      /^Sur\s+l[’']/i,
      /^Par ces motifs/i,
      /^Arrêt$/i,
      /^Ordonnance$/i,
      /^Signatures$/i,
    ];

    const candidates = [];
    for (const p of paras) {
      const text = normalizeHeadingText(p.textContent);
      if (!text) continue;

      const lvlFromClass = inferHeadingLevelFromClass(p);

      // Ignore numbered paragraphs (points)
      if (/^\d+\b/.test(text)) continue;

      const looksLikeHeading = Boolean(lvlFromClass) || headingPatterns.some((re) => re.test(text));

      if (!looksLikeHeading) continue;

      const level = lvlFromClass || (/^Sur\s+/i.test(text) ? 2 : 1);

      candidates.push({ p, text, level });
    }

    return candidates;
  }

  function ensureAnchorForHeading(headingP, index) {
    if (!headingP) return null;
    const existing = headingP.querySelector('a.ih-toc-anchor');
    if (existing) return existing;

    const id = `ih-toc-h-${index}`;
    headingP.dataset.ihTocId = id;

    const a = document.createElement('a');
    a.className = 'ih-toc-anchor';
    a.id = id;
    a.href = `#${id}`;
    a.setAttribute('aria-hidden', 'true');

    headingP.insertBefore(a, headingP.firstChild);
    return a;
  }

  function computeScrollTopToElement(container, el, offsetPx) {
    if (!container || !el) return null;

    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();

    const current = container.scrollTop;
    const delta = eRect.top - cRect.top;

    return Math.max(0, Math.round(current + delta - (offsetPx || 0)));
  }

  function scrollHeadingIntoView(previewRoot, headingP) {
    const container = getScrollContainerForPreview(previewRoot);
    if (!container) return false;

    // Compute offset to avoid hiding target under the preview header.
    // Prefer an explicit preview header if present; fall back to a conservative small gap.
    let headerHeight = 0;
    try {
      const header = previewRoot.querySelector('.preview-header') || previewRoot.querySelector('.information-panel-header') || previewRoot.querySelector('[role="tablist"]');
      if (header) {
        headerHeight = Math.round(header.getBoundingClientRect().height || 0);
      }
    } catch {
      headerHeight = 0;
    }

    const offset = Math.max(14, headerHeight + 8);
    const top = computeScrollTopToElement(container, headingP, offset);
    if (top == null) return false;

    container.scrollTop = top;

    window.setTimeout(() => {
      const top2 = computeScrollTopToElement(container, headingP, offset);
      if (top2 != null) container.scrollTop = top2;
    }, 120);

    return true;
  }

  function buildTocItems(previewRoot) {
    const headings = findHeadingCandidates(previewRoot);

    const items = [];
    headings.forEach((h, idx) => {
      ensureAnchorForHeading(h.p, idx + 1);
      items.push({
        id: h.p.dataset.ihTocId || `ih-toc-h-${idx + 1}`,
        text: h.text,
        level: h.level,
        node: h.p,
      });
    });

    return items;
  }

  function renderToc(containerEl, items) {
    containerEl.textContent = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'ih-muted';
      empty.textContent = 'No headings detected.';
      containerEl.appendChild(empty);
      return;
    }

    for (const item of items) {
      const a = document.createElement('a');
      a.href = `#${item.id}`;
      a.className = 'ih-toc-link';
      a.dataset.ihTocId = item.id;
      a.textContent = item.text;
      a.style.paddingLeft = BI.px(8 + (item.level - 1) * 14);
      containerEl.appendChild(a);
    }
  }

  function attachTocClickHandler(rootEl, getPreviewRoot) {
    if (rootEl.dataset.ihTocClickBound === '1') return;
    rootEl.dataset.ihTocClickBound = '1';

    rootEl.addEventListener(
      'click',
      (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const link = target.closest('a.ih-toc-link');
        if (!link) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const id = link.dataset.ihTocId;
        if (!id) return;

        const previewRoot = getPreviewRoot();
        if (!previewRoot) return;

        const anchor = previewRoot.querySelector(`#${CSS.escape(id)}`);
        const p = anchor?.parentElement;
        if (p) {
          scrollHeadingIntoView(previewRoot, p);
          return;
        }

        const text = normalizeHeadingText(link.textContent);
        if (!text) return;

        const candidates = Array.from(previewRoot.querySelectorAll('p')).filter((x) => normalizeHeadingText(x.textContent) === text);
        if (candidates.length) {
          scrollHeadingIntoView(previewRoot, candidates[0]);
        }
      },
      true,
    );
  }

  BI.getScrollContainerForPreview = getScrollContainerForPreview;
  BI.findHeadingCandidates = findHeadingCandidates;
  BI.buildTocItems = buildTocItems;
  BI.renderToc = renderToc;
  BI.attachTocClickHandler = attachTocClickHandler;
  BI.scrollHeadingIntoView = scrollHeadingIntoView;
})();
