(() => {
  const BI = globalThis.BetterInfocuria;

  const LS_HIDE_RESULTS = 'ih:hide:results';
  const LS_HIDE_HELPER = 'ih:hide:helper';

  function readFlag(key) {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  function writeFlag(key, value) {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch {
      // ignore
    }
  }

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

    // Keep pane detection independent from our own hide/show toggles.
    const children = Array.from(mainContent.children).filter((el) => el.id !== 'infocuria-helper' && !el.classList.contains('ih-splitter'));
    if (children.length < 1) return null;

    const visibleChildren = children.filter(BI.isVisible);
    if (visibleChildren.length < 1) return null;

    const detailsPane = pickDetailsPane(visibleChildren) || pickDetailsPane(children);
    if (!detailsPane) return null;

    const listCandidates = children.filter((el) => el !== detailsPane);
    const listPane = pickListPane(listCandidates);

    return { mainContent, listPane: listPane || null, detailsPane };
  }

  function setFlexBasis(el, valuePx) {
    // Allow panels to shrink when the viewport becomes narrower.
    el.style.setProperty('flex', `0 1 ${BI.px(valuePx)}`, 'important');
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

  function findFilterToggleButton() {
    // Known variants seen on the site.
    const byClass = document.querySelector('button.filter-tooltip-hide,button.filter-tooltip-show');
    if (byClass) return byClass;

    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find((b) => /masquer\s+les\s+filtres|afficher\s+les\s+filtres/i.test((b.textContent || '').trim())) || null;
  }

  function ensureLayoutToggles(panes, panelEl) {
    const hostBtn = findFilterToggleButton();
    const container =
      hostBtn?.parentElement ||
      document.getElementById('main-content') ||
      document.querySelector('main') ||
      document.body;

    let wrap = document.getElementById('ih-layout-toggles');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'ih-layout-toggles';
      wrap.className = 'ih-layout-toggles';

      const mkBtn = (id, label, iconClass) => {
        // IMPORTANT: Infocuria uses Angular emulated encapsulation (scoped styles on _ngcontent-*).
        // To get identical styling, clone the existing filter button so those attributes carry over.
        const b = (hostBtn ? hostBtn.cloneNode(true) : document.createElement('button'));
        b.type = 'button';
        b.id = id;
        b.tabIndex = 0;
        b.setAttribute('aria-disabled', 'false');
        b.classList.add('ih-layout-toggle');
        if (!hostBtn) {
          b.className = 'curia-button curia-button--md curia-button--tertiary ih-layout-toggle';
          const iconLeft = document.createElement('i');
          iconLeft.className = 'icon-left';
          const icon = document.createElement('i');
          icon.className = iconClass;
          icon.setAttribute('aria-hidden', 'true');
          icon.setAttribute('aria-label', '');
          iconLeft.appendChild(icon);
          b.appendChild(iconLeft);
          b.appendChild(document.createTextNode(` ${label} `));
          return b;
        }

        // If cloned, rewrite label/icon but keep its internal structure & scoped attributes.
        const setBtnLabel = (btn, nextLabel, nextIconClass) => {
          if (!btn) return;
          const iconEl = btn.querySelector('.icon-left i');
          if (iconEl && nextIconClass) iconEl.className = nextIconClass;
          const iconLeft = btn.querySelector('.icon-left');
          btn.textContent = '';
          if (iconLeft) btn.appendChild(iconLeft);
          btn.appendChild(document.createTextNode(` ${nextLabel} `));
        };

        setBtnLabel(b, label, iconClass);
        return b;
      };

      const btnResults = mkBtn('ih-toggle-results', 'Masquer les résultats', 'bi bi-list-ul');
      const btnHelper = mkBtn('ih-toggle-helper', 'Masquer Better Infocuria', 'bi bi-layout-sidebar-inset');

      btnResults.addEventListener('click', () => {
        writeFlag(LS_HIDE_RESULTS, !readFlag(LS_HIDE_RESULTS));
        const p = document.getElementById('infocuria-helper');
        if (p) ensureDockedLayout(p);
      });

      btnHelper.addEventListener('click', () => {
        writeFlag(LS_HIDE_HELPER, !readFlag(LS_HIDE_HELPER));
        const p = document.getElementById('infocuria-helper');
        if (p) ensureDockedLayout(p);
      });

      wrap.appendChild(btnResults);
      wrap.appendChild(btnHelper);

      // Place next to the filter toggle when possible; otherwise pin to the top of main-content.
      if (hostBtn && hostBtn.parentElement) {
        hostBtn.parentElement.insertBefore(wrap, hostBtn.nextSibling);
      } else if (container.firstChild) {
        container.insertBefore(wrap, container.firstChild);
      } else {
        container.appendChild(wrap);
      }
    }

    // Update labels from state.
    const hideResults = readFlag(LS_HIDE_RESULTS);
    const hideHelper = readFlag(LS_HIDE_HELPER);
    const btnResults = wrap.querySelector('#ih-toggle-results');
    const btnHelper = wrap.querySelector('#ih-toggle-helper');
    const setBtnLabel = (btn, label, iconClass) => {
      if (!btn) return;
      // Keep the icon-left structure.
      const iconEl = btn.querySelector('.icon-left i');
      if (iconEl && iconClass) iconEl.className = iconClass;
      const iconLeft = btn.querySelector('.icon-left');
      btn.textContent = '';
      if (iconLeft) btn.appendChild(iconLeft);
      btn.appendChild(document.createTextNode(` ${label} `));
    };

    setBtnLabel(btnResults, hideResults ? 'Afficher les résultats' : 'Masquer les résultats', 'bi bi-list-ul');
    setBtnLabel(btnHelper, hideHelper ? 'Afficher Better Infocuria' : 'Masquer Better Infocuria', 'bi bi-layout-sidebar-inset');

    // Hide the results toggle if we can't identify the results pane.
    if (btnResults) btnResults.style.display = panes?.listPane ? '' : 'none';

    // Hide helper toggle if panel doesn't exist yet.
    if (btnHelper) btnHelper.style.display = panelEl ? '' : 'none';
  }

  function ensureDockedLayout(panelEl) {
    const panes = getLayoutPanes();
    const hideResults = readFlag(LS_HIDE_RESULTS);
    const hideHelper = readFlag(LS_HIDE_HELPER);

    if (!panes) {
      // When we can't dock into the 3-column layout (e.g., narrow viewport), keep the helper
      // fixed to the right edge so it doesn't randomly cover the document.
      panelEl.classList.remove('ih-docked');
      panelEl.classList.remove('ih-floating');
      panelEl.classList.add('ih-fixed-right');
      if (panelEl.parentElement !== document.body) {
        document.body.appendChild(panelEl);
      }
      panelEl.style.display = hideHelper ? 'none' : '';
      ensureLayoutToggles(null, panelEl);
      return false;
    }

    const { mainContent, listPane, detailsPane } = panes;

    ensureLayoutToggles(panes, panelEl);

    // Apply user hide states.
    if (listPane) listPane.style.display = hideResults ? 'none' : '';

    panelEl.style.display = hideHelper ? 'none' : '';

    if (panelEl.parentElement !== mainContent) {
      panelEl.classList.add('ih-docked');
      panelEl.classList.remove('ih-floating');
      panelEl.classList.remove('ih-fixed-right');
      mainContent.appendChild(panelEl);
    }
    panelEl.classList.add('ih-docked');
    panelEl.classList.remove('ih-floating');
    panelEl.classList.remove('ih-fixed-right');

    const splitter1 = ensureSplitter('ih-splitter-1');
    const splitter2 = ensureSplitter('ih-splitter-2');

    // Splitter 1 (between list/results and details)
    if (!hideResults && listPane) {
      splitter1.style.display = '';
      if (splitter1.parentElement !== mainContent) {
        mainContent.insertBefore(splitter1, detailsPane);
      } else if (splitter1.nextElementSibling !== detailsPane) {
        mainContent.insertBefore(splitter1, detailsPane);
      }
    } else {
      splitter1.style.display = 'none';
    }

    // Splitter 2 (between details and helper)
    if (!hideHelper) {
      splitter2.style.display = '';
      if (splitter2.parentElement !== mainContent) {
        mainContent.insertBefore(splitter2, panelEl);
      } else if (splitter2.nextElementSibling !== panelEl) {
        mainContent.insertBefore(splitter2, panelEl);
      }
    } else {
      splitter2.style.display = 'none';
    }

    const splitW = Math.round(splitter1.getBoundingClientRect().width || 12);
    const minList = 320;
    const minDetails = 420;
    const minHelper = 320;
    const splitterCount = (hideResults || !listPane ? 0 : 1) + (hideHelper ? 0 : 1);
    const total = Math.max(0, mainContent.clientWidth - splitW * splitterCount);
    if (total <= 0) return true;

    const layoutKey = `${(listPane || {}).tagName || 'NONE'}:${(listPane || {}).className || ''}|${detailsPane.tagName}:${detailsPane.className}|${Math.round(mainContent.clientWidth)}|${hideResults ? 'R0' : 'R1'}|${hideHelper ? 'H0' : 'H1'}`;
    const prevKey = panelEl.dataset.ihLayoutKey;
    const prevTotal = Number(panelEl.dataset.ihTotal || '0');
    const needsSizing = panelEl.dataset.ihSized !== '1' || prevKey !== layoutKey || Math.abs(prevTotal - total) > 2;

    let wList = BI.readNumber('ih:w:list');
    let wDetails = BI.readNumber('ih:w:details');
    let wHelper = BI.readNumber('ih:w:helper');

    if (needsSizing) {
      if (hideHelper) wHelper = null;
      if (hideResults) wList = null;

      // Default splits depend on which panes are visible.
      if ((!wList && !hideResults) || !wDetails || (!wHelper && !hideHelper)) {
        if (!hideResults && !hideHelper) {
          wList = wList || Math.round(total * 0.38);
          wDetails = wDetails || Math.round(total * 0.42);
          wHelper = wHelper || total - wList - wDetails;
        } else if (hideResults && !hideHelper) {
          wDetails = wDetails || Math.round(total * 0.58);
          wHelper = wHelper || total - wDetails;
        } else if (!hideResults && hideHelper) {
          wList = wList || Math.round(total * 0.45);
          wDetails = wDetails || total - wList;
        } else {
          // Only details visible.
          wDetails = total;
        }
      }

      // Always scale visible panes to fill the available width (like the original site).
      const scaleToTotal = (vals) => {
        const sum = vals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
        if (!sum || Math.abs(sum - total) < 2) return vals;
        const f = total / sum;
        return vals.map((v) => (Number.isFinite(v) ? v * f : v));
      };

      if (!hideResults && !hideHelper) {
        [wList, wDetails, wHelper] = scaleToTotal([wList, wDetails, wHelper]);
        wList = BI.clamp(wList, minList, total - minDetails - minHelper);
        wDetails = BI.clamp(wDetails, minDetails, total - wList - minHelper);
        wHelper = total - wList - wDetails;
        wHelper = BI.clamp(wHelper, minHelper, total - wList - wDetails);
      } else if (hideResults && !hideHelper) {
        [wDetails, wHelper] = scaleToTotal([wDetails, wHelper]);
        wDetails = BI.clamp(wDetails, minDetails, total - minHelper);
        wHelper = BI.clamp(total - wDetails, minHelper, total - wDetails);
        wDetails = total - wHelper;
      } else if (!hideResults && hideHelper) {
        [wList, wDetails] = scaleToTotal([wList, wDetails]);
        wList = BI.clamp(wList, minList, total - minDetails);
        wDetails = BI.clamp(total - wList, minDetails, total - wList);
        wList = total - wDetails;
      } else {
        wDetails = total;
      }

      if (!hideResults && listPane) setFlexBasis(listPane, wList);
      setFlexBasis(detailsPane, wDetails);
      if (!hideHelper) setFlexBasis(panelEl, wHelper);

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

    if (!hideResults && listPane) bindSplitter(splitter1, listPane, detailsPane, 'ih:w:list', 'ih:w:details');
    if (!hideHelper) bindSplitter(splitter2, detailsPane, panelEl, 'ih:w:details', 'ih:w:helper');

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
