(() => {
  const BI = globalThis.BetterInfocuria;

  function getMainContentRoot() {
    return document.getElementById('main-content');
  }

  function pickDetailsPane(children) {
    const byInfoId = children.find((el) => el.querySelector('#information-panel-container'));
    if (byInfoId) return byInfoId;
    const byPreview = children.find((el) => el.querySelector('#panel-document-preview'));
    if (byPreview) return byPreview;
    const byRegionLabel = children.find((el) => {
      const region = el.querySelector('[role="region"][aria-label]');
      const label = (region?.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('panneau') && label.includes('latéral');
    });
    if (byRegionLabel) return byRegionLabel;
    const byAria = children.find((el) => (el.getAttribute('aria-label') || '').toLowerCase().includes('panneau'));
    if (byAria) return byAria;
    return null;
  }

  function pickListPane(children) {
    const byHeading = children.find((el) => {
      const h = Array.from(el.querySelectorAll('h1,h2,h3,h4,h5')).find((x) => /Liste des affaires/i.test((x.textContent || '').trim()));
      return Boolean(h);
    });
    if (byHeading) return byHeading;

    return children.slice().sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)[0] || null;
  }

  function getLayoutPanes() {
    const mainContent = getMainContentRoot();
    if (!mainContent) return null;

    const children = Array.from(mainContent.children).filter((el) => el.id !== 'infocuria-helper' && !el.classList.contains('ih-splitter'));
    const visibleChildren = children.filter(BI.isVisible);
    if (visibleChildren.length < 2) return null;

    const detailsPane =
      pickDetailsPane(visibleChildren) ||
      visibleChildren.slice().sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)[1];
    if (!detailsPane) return null;

    const listCandidates = visibleChildren.filter((el) => el !== detailsPane);
    const listPane = pickListPane(listCandidates);
    if (!listPane) return null;

    return { mainContent, listPane, detailsPane };
  }

  function setFlexBasis(el, valuePx) {
    el.style.setProperty('flex', `0 0 ${BI.px(valuePx)}`, 'important');
    el.style.setProperty('max-width', BI.px(valuePx), 'important');
  }

  function ensureSplitter(id) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.className = 'ih-splitter';
    el.setAttribute('role', 'separator');
    el.setAttribute('aria-orientation', 'vertical');
    el.setAttribute('aria-label', 'Resize panels');
    el.title = 'Drag to resize panels';
    return el;
  }

  function setPanelHidden(hidden) {
    const panel = document.getElementById('infocuria-helper');
    if (!panel) return;
    if (hidden) panel.classList.add('ih-hidden');
    else panel.classList.remove('ih-hidden');
  }

  function ensureDockedLayout(panelEl) {
    const panes = getLayoutPanes();
    if (!panes) {
      panelEl.classList.add('ih-floating');
      panelEl.classList.remove('ih-docked');
      if (panelEl.parentElement !== document.body) {
        document.body.appendChild(panelEl);
      }
      return false;
    }

    const { mainContent, listPane, detailsPane } = panes;

    if (panelEl.parentElement !== mainContent) {
      panelEl.classList.add('ih-docked');
      panelEl.classList.remove('ih-floating');
      mainContent.appendChild(panelEl);
    }
    panelEl.classList.add('ih-docked');
    panelEl.classList.remove('ih-floating');

    const splitter1 = ensureSplitter('ih-splitter-1');
    const splitter2 = ensureSplitter('ih-splitter-2');

    if (splitter1.parentElement !== mainContent) {
      mainContent.insertBefore(splitter1, detailsPane);
    } else if (splitter1.nextElementSibling !== detailsPane) {
      mainContent.insertBefore(splitter1, detailsPane);
    }

    if (splitter2.parentElement !== mainContent) {
      mainContent.insertBefore(splitter2, panelEl);
    } else if (splitter2.nextElementSibling !== panelEl) {
      mainContent.insertBefore(splitter2, panelEl);
    }

    const splitW = Math.round(splitter1.getBoundingClientRect().width || 12);
    const minList = 320;
    const minDetails = 420;
    const minHelper = 320;
    const total = Math.max(0, mainContent.clientWidth - splitW * 2);
    if (total <= 0) return true;

    const layoutKey = `${listPane.tagName}:${listPane.className}|${detailsPane.tagName}:${detailsPane.className}|${Math.round(mainContent.clientWidth)}`;
    const prevKey = panelEl.dataset.ihLayoutKey;
    const prevTotal = Number(panelEl.dataset.ihTotal || '0');
    const needsSizing = panelEl.dataset.ihSized !== '1' || prevKey !== layoutKey || Math.abs(prevTotal - total) > 2;

    let wList = BI.readNumber('ih:w:list');
    let wDetails = BI.readNumber('ih:w:details');
    let wHelper = BI.readNumber('ih:w:helper');

    if (needsSizing) {
      if (!wList || !wDetails || !wHelper || wList + wDetails + wHelper > total + 5) {
        wList = Math.round(total * 0.38);
        wDetails = Math.round(total * 0.42);
        wHelper = total - wList - wDetails;
      }

      wList = BI.clamp(wList, minList, total - minDetails - minHelper);
      wDetails = BI.clamp(wDetails, minDetails, total - wList - minHelper);
      wHelper = total - wList - wDetails;
      wHelper = BI.clamp(wHelper, minHelper, total - wList - wDetails);

      const remaining = total - wList - wDetails;
      if (remaining !== wHelper) {
        wHelper = remaining;
      }

      setFlexBasis(listPane, wList);
      setFlexBasis(detailsPane, wDetails);
      setFlexBasis(panelEl, wHelper);

      panelEl.dataset.ihSized = '1';
      panelEl.dataset.ihLayoutKey = layoutKey;
      panelEl.dataset.ihTotal = String(total);
    }

    const bindSplitter = (splitter, leftEl, rightEl, leftKey, rightKey) => {
      if (splitter.dataset.ihBound === '1') return;
      splitter.dataset.ihBound = '1';

      splitter.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        document.documentElement.classList.add('ih-resizing');
        splitter.setPointerCapture(e.pointerId);
        splitter.classList.add('ih-active');

        const leftStart = leftEl.getBoundingClientRect().width;
        const rightStart = rightEl.getBoundingClientRect().width;
        const startX = e.clientX;

        const minLeft = leftEl === listPane ? minList : leftEl === detailsPane ? minDetails : minHelper;
        const minRight = rightEl === listPane ? minList : rightEl === detailsPane ? minDetails : minHelper;

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const newLeft = BI.clamp(leftStart + dx, minLeft, leftStart + rightStart - minRight);
          const newRight = leftStart + rightStart - newLeft;

          setFlexBasis(leftEl, newLeft);
          setFlexBasis(rightEl, newRight);
        };

        const onUp = () => {
          splitter.classList.remove('ih-active');
          document.documentElement.classList.remove('ih-resizing');
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);

          BI.writeNumber(leftKey, leftEl.getBoundingClientRect().width);
          BI.writeNumber(rightKey, rightEl.getBoundingClientRect().width);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp, { once: true });

        const cleanup = () => {
          splitter.classList.remove('ih-active');
          document.documentElement.classList.remove('ih-resizing');
          document.removeEventListener('pointermove', onMove);
        };

        splitter.addEventListener('pointercancel', cleanup, { once: true });
        splitter.addEventListener('lostpointercapture', cleanup, { once: true });
      });
    };

    syncDockedTop(panelEl, detailsPane);

    bindSplitter(splitter1, listPane, detailsPane, 'ih:w:list', 'ih:w:details');
    bindSplitter(splitter2, detailsPane, panelEl, 'ih:w:details', 'ih:w:helper');

    if (!window.__ihResizeBound) {
      window.__ihResizeBound = true;
      window.addEventListener('resize', () => {
        const p = document.getElementById('infocuria-helper');
        if (!p) return;
        ensureDockedLayout(p);
      });
    }

    return true;
  }

  function syncDockedTop(panelEl, detailsPane) {
    if (!panelEl) return;
    const details = detailsPane || getLayoutPanes()?.detailsPane;
    if (!details) return;

    // Revert to the simpler behavior: align helper top to the judgment header/tab bar.
    const tablist = details.querySelector('[role="tablist"]');
    const header = tablist?.closest?.('.information-panel-header');
    const refEl = header || tablist || details;
    const refTop = Math.round(refEl.getBoundingClientRect().top);
    const topPx = Math.max(0, refTop);
    panelEl.style.setProperty('--ih-docked-top', BI.px(topPx));
  }

  function ensureDockedTopSync(panelEl, getPreviewRoot) {
    if (!panelEl) return;
    if (panelEl.dataset.ihTopSyncBound === '1') {
      // Still keep the scroll container binding fresh.
      bindPreviewScroll(panelEl, getPreviewRoot);
      return;
    }
    panelEl.dataset.ihTopSyncBound = '1';

    let raf = 0;
    const tick = () => {
      raf = 0;
      const panel = document.getElementById('infocuria-helper');
      if (!panel || panel.classList.contains('ih-hidden')) return;
      if (!panel.classList.contains('ih-docked')) return;
      syncDockedTop(panel);
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(tick);
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    bindPreviewScroll(panelEl, getPreviewRoot, schedule);
  }

  function bindPreviewScroll(panelEl, getPreviewRoot, onScroll) {
    const cb = onScroll || (() => syncDockedTop(panelEl));
    const previewRoot = typeof getPreviewRoot === 'function' ? getPreviewRoot() : document.querySelector('#panel-document-preview');
    const scroller = previewRoot?.querySelector('#document-viewer-content.preview-content') || previewRoot?.querySelector('#document-viewer-content') || null;

    const prev = panelEl.__ihBoundScrollEl;
    if (prev === scroller) return;
    if (prev && panelEl.__ihBoundScrollHandler) {
      try {
        prev.removeEventListener('scroll', panelEl.__ihBoundScrollHandler);
      } catch {
        // ignore
      }
    }
    panelEl.__ihBoundScrollEl = scroller;
    panelEl.__ihBoundScrollHandler = cb;
    if (scroller) {
      scroller.addEventListener('scroll', cb, { passive: true });
    }
  }

  BI.getMainContentRoot = getMainContentRoot;
  BI.getLayoutPanes = getLayoutPanes;
  BI.ensureSplitter = ensureSplitter;
  BI.ensureDockedLayout = ensureDockedLayout;
  BI.setPanelHidden = setPanelHidden;
  BI.syncDockedTop = syncDockedTop;
  BI.ensureDockedTopSync = ensureDockedTopSync;
})();
