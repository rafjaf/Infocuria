(() => {
  const BI = globalThis.BetterInfocuria;

  // Session-only layout state (no persistence).
  let hideResults = false;
  let hideHelper = false;
  let lastWList = null;
  let lastWDetails = null;
  let lastWHelper = null;
  let forceMinListOnce = false;
  let forceMinHelperOnce = false;

  const MIN_LIST = 320;
  const MIN_DETAILS = 420;
  const MIN_HELPER = 320;

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
    // Allow flex items to actually shrink inside a constrained row.
    el.style.setProperty('min-width', '0px', 'important');
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

  function findMobileReturnButton() {
    // Narrow/mobile layout shows a "Retour" button instead of the filters toggle.
    const byId = document.querySelector('#close-information-button button');
    if (byId) return byId;
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find((b) => /\bretour\b/i.test((b.textContent || '').trim())) || null;
  }

  function findAnyFilterButton() {
    return (
      findFilterToggleButton() ||
      document.querySelector('button[aria-label*="filtres" i]') ||
      Array.from(document.querySelectorAll('button')).find((b) => /\bfiltres\b/i.test((b.textContent || '').trim())) ||
      null
    );
  }

  function ensureLayoutToggles(panes, panelEl) {
    const hostBtn = findFilterToggleButton();
    const returnBtn = findMobileReturnButton();
    const anchorBtn = hostBtn || returnBtn;

    let wrap = document.getElementById('ih-layout-toggles');

    // Never attach our button group into #main-content (it is the flex container that holds panes).
    // If neither the filters toggle nor the Retour button is available yet, don't create/move.
    if (!anchorBtn) {
      if (wrap) {
        // Still update labels/visibility based on current state.
        const btnFilters = wrap.querySelector('#ih-toggle-filters');
        const btnResults = wrap.querySelector('#ih-toggle-results');
        const btnHelper = wrap.querySelector('#ih-toggle-helper');
        const btnScroll = wrap.querySelector('#ih-scroll-to-doc');
        const setBtnLabel = (btn, label, iconClass) => {
          if (!btn) return;
          const iconEl = btn.querySelector('.icon-left i');
          if (iconEl && iconClass) iconEl.className = iconClass;
          const iconLeft = btn.querySelector('.icon-left');
          btn.textContent = '';
          if (iconLeft) btn.appendChild(iconLeft);
          btn.appendChild(document.createTextNode(` ${label} `));
        };
        setBtnLabel(btnFilters, 'Filtres', 'bi bi-funnel');
        setBtnLabel(btnResults, hideResults ? 'Afficher les résultats' : 'Masquer les résultats', 'bi bi-list-ul');
        setBtnLabel(btnHelper, hideHelper ? 'Afficher Better Infocuria' : 'Masquer Better Infocuria', 'bi bi-layout-sidebar-inset');
        setBtnLabel(btnScroll, 'Aller au document', 'bi bi-arrow-down');

        if (btnResults) btnResults.style.display = panes?.listPane ? '' : 'none';
        if (btnHelper) btnHelper.style.display = panelEl ? '' : 'none';
        if (btnFilters) btnFilters.style.display = findAnyFilterButton() ? '' : 'none';
      }
      return;
    }

    const container = anchorBtn.parentElement;
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'ih-layout-toggles';
      wrap.className = 'ih-layout-toggles';

      const mkBtn = (id, label, iconClass) => {
        // IMPORTANT: Infocuria uses Angular emulated encapsulation (scoped styles on _ngcontent-*).
        // To get identical styling, clone the existing filter button so those attributes carry over.
        const tpl = hostBtn || returnBtn;
        const b = (tpl ? tpl.cloneNode(true) : document.createElement('button'));
        b.type = 'button';
        b.id = id;
        b.tabIndex = 0;
        b.setAttribute('aria-disabled', 'false');
        b.classList.add('ih-layout-toggle');
        if (!tpl) {
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

      const btnFilters = mkBtn('ih-toggle-filters', 'Filtres', 'bi bi-funnel');
      const btnResults = mkBtn('ih-toggle-results', 'Masquer les résultats', 'bi bi-list-ul');
      const btnHelper = mkBtn('ih-toggle-helper', 'Masquer Better Infocuria', 'bi bi-layout-sidebar-inset');
      const btnScroll = mkBtn('ih-scroll-to-doc', 'Aller au document', 'bi bi-arrow-down');
      btnScroll.setAttribute('aria-label', 'Aller au document');
      btnScroll.title = 'Aller au document';

      btnFilters.addEventListener('click', () => {
        const b = findAnyFilterButton();
        if (b) b.click();
      });

      btnResults.addEventListener('click', () => {
        hideResults = !hideResults;
        const p = document.getElementById('infocuria-helper');
        if (p) ensureDockedLayout(p);
      });

      btnHelper.addEventListener('click', () => {
        hideHelper = !hideHelper;
        const p = document.getElementById('infocuria-helper');
        if (p) ensureDockedLayout(p);
      });

      btnScroll.addEventListener('click', () => {
        // Extra behavior:
        // - hide filters (if currently visible)
        // - shrink results pane to minimum width
        // - scroll the information panel into view

        try {
          const t = (hostBtn?.textContent || '').trim();
          const isHideFilters = hostBtn?.classList?.contains('filter-tooltip-hide') || /masquer\s+les\s+filtres/i.test(t);
          if (hostBtn && isHideFilters) hostBtn.click();
        } catch {
          // ignore
        }

        // Let the SPA react to the filter toggle before resizing/scrolling.
        // We run 2 layout passes because Infocuria can resize panes after the filter click.
        forceMinListOnce = true;
        forceMinHelperOnce = true;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const p = document.getElementById('infocuria-helper');
            if (p) ensureDockedLayout(p);
            window.requestAnimationFrame(() => {
              forceMinListOnce = true;
              forceMinHelperOnce = true;
              if (p) ensureDockedLayout(p);
              document.querySelector('app-information-panel')?.scrollIntoView();
            });
          });
        });
      });

      wrap.appendChild(btnResults);
      wrap.appendChild(btnHelper);
      wrap.appendChild(btnScroll);

      // In mobile layout, the site replaces the filters toggle with a Retour button.
      // That button tends to mess up our 3-pane layout, so hide it when we can.
      if (!hostBtn && returnBtn) {
        try {
          const host = returnBtn.closest?.('#close-information-button') || returnBtn.closest?.('app-harmonia-button');
          if (host) host.style.setProperty('display', 'none', 'important');
          else returnBtn.style.setProperty('display', 'none', 'important');
        } catch {
          // ignore
        }
      }

      // Place next to the filter toggle when possible; otherwise pin to the top of main-content.
      anchorBtn.parentElement.insertBefore(wrap, anchorBtn.nextSibling);
    }

    // Responsive re-render can move/recreate the filters toggle button.
    // Ensure our group stays next to it.
    if (wrap.parentElement !== anchorBtn.parentElement) {
      anchorBtn.parentElement.insertBefore(wrap, anchorBtn.nextSibling);
    }

    // Update labels from state.
    const btnResults = wrap.querySelector('#ih-toggle-results');
    const btnHelper = wrap.querySelector('#ih-toggle-helper');
    const btnFilters = wrap.querySelector('#ih-toggle-filters');
    const btnScroll = wrap.querySelector('#ih-scroll-to-doc');
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
    setBtnLabel(btnFilters, 'Filtres', 'bi bi-funnel');
    setBtnLabel(btnScroll, 'Aller au document', 'bi bi-arrow-down');

    // Hide the results toggle if we can't identify the results pane.
    if (btnResults) btnResults.style.display = panes?.listPane ? '' : 'none';

    // Hide helper toggle if panel doesn't exist yet.
    if (btnHelper) btnHelper.style.display = panelEl ? '' : 'none';

    // Hide filters toggle when the site doesn't expose any filters toggle we can click.
    if (btnFilters) btnFilters.style.display = findAnyFilterButton() ? '' : 'none';
  }

  function ensureDockedLayout(panelEl) {
    const panes = getLayoutPanes();

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

    // Infocuria sometimes keeps the results pane in the DOM but hides it via responsive CSS.
    // In that case we must treat it as absent, otherwise our min-width + splitter math
    // reserves space for an invisible pane and the helper becomes “stuck” too wide.
    const wantList = Boolean(listPane) && !hideResults && BI.isVisible(listPane);
    const wantHelper = !hideHelper;

    if (panelEl.parentElement !== mainContent) {
      panelEl.classList.add('ih-docked');
      panelEl.classList.remove('ih-floating');
      panelEl.classList.remove('ih-fixed-right');
      mainContent.appendChild(panelEl);
    }
    panelEl.classList.add('ih-docked');
    panelEl.classList.remove('ih-floating');
    panelEl.classList.remove('ih-fixed-right');

    // Mark presence so we can scope any emergency overlay fixes.
    try {
      document.documentElement.classList.add('ih-has-docked');
    } catch {
      // ignore
    }

    // If a previously closed filters drawer left a transparent backdrop, disable it.
    neutralizeLingeringBackdrops();

    // On narrow/mobile layouts, Infocuria can switch main-content to a stacked layout.
    // Force a horizontal, non-wrapping flex row while our docked panes/splitters are present,
    // otherwise dragging splitters has no visible effect.
    try {
      mainContent.style.setProperty('display', 'flex', 'important');
      mainContent.style.setProperty('flex-direction', 'row', 'important');
      mainContent.style.setProperty('flex-wrap', 'nowrap', 'important');
      mainContent.style.setProperty('align-items', 'stretch', 'important');
    } catch {
      // ignore
    }

    const splitter1 = ensureSplitter('ih-splitter-1');
    const splitter2 = ensureSplitter('ih-splitter-2');

    // Splitter 1 (between list/results and details)
    if (wantList) {
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
    if (wantHelper) {
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
    let minList = MIN_LIST;
    let minDetails = MIN_DETAILS;
    let minHelper = MIN_HELPER;

    // If a pane isn't actually present, it shouldn't claim any minimum width.
    if (!wantList) minList = 0;
    if (!wantHelper) minHelper = 0;

    // If the viewport is too narrow, relax minimums so splitters can still move.
    // (Avoid impossible constraints like minDetails + minHelper > total.)
    const relaxMins2 = (totalW, a, b) => {
      if (totalW <= 0) return [0, 0];
      if (a + b <= totalW) return [a, b];
      const scale = totalW / (a + b);
      const aa = Math.max(0, Math.floor(a * scale));
      const bb = Math.max(0, totalW - aa);
      return [aa, bb];
    };
    const relaxMins3 = (totalW, a, b, c) => {
      if (totalW <= 0) return [0, 0, 0];
      if (a + b + c <= totalW) return [a, b, c];
      // Prefer giving space to details; relax list first, then helper, then details.
      let overflow = a + b + c - totalW;
      let aa = a;
      let bb = b;
      let cc = c;
      const reduceA = Math.min(overflow, aa);
      aa -= reduceA;
      overflow -= reduceA;
      const reduceC = Math.min(overflow, cc);
      cc -= reduceC;
      overflow -= reduceC;
      const reduceB = Math.min(overflow, bb);
      bb -= reduceB;
      return [Math.max(0, aa), Math.max(0, bb), Math.max(0, cc)];
    };

    const splitterCount = (wantList ? 1 : 0) + (wantHelper ? 1 : 0);
    const total = Math.max(0, mainContent.clientWidth - splitW * splitterCount);
    if (total <= 0) return true;

    if (wantList && wantHelper) {
      [minList, minDetails, minHelper] = relaxMins3(total, minList, minDetails, minHelper);
    } else if (!wantList && wantHelper) {
      [minDetails, minHelper] = relaxMins2(total, minDetails, minHelper);
    } else if (wantList && !wantHelper) {
      [minList, minDetails] = relaxMins2(total, minList, minDetails);
      minHelper = 0;
    } else {
      minList = 0;
      minHelper = 0;
    }

    const layoutKey = `${(listPane || {}).tagName || 'NONE'}:${(listPane || {}).className || ''}|${detailsPane.tagName}:${detailsPane.className}|${Math.round(mainContent.clientWidth)}|${wantList ? 'L1' : 'L0'}|${wantHelper ? 'H1' : 'H0'}`;
    const prevKey = panelEl.dataset.ihLayoutKey;
    const prevTotal = Number(panelEl.dataset.ihTotal || '0');
    const needsSizing = panelEl.dataset.ihSized !== '1' || prevKey !== layoutKey || Math.abs(prevTotal - total) > 2;

    let wList = lastWList;
    let wDetails = lastWDetails;
    let wHelper = lastWHelper;

    // If we don't have a remembered width (session), seed from current DOM widths.
    if (!wList && wantList) wList = listPane.getBoundingClientRect().width;
    if (!wDetails) wDetails = detailsPane.getBoundingClientRect().width;
    if (!wHelper) wHelper = panelEl.getBoundingClientRect().width;

    if (needsSizing) {
      if (hideHelper) wHelper = null;
      if (hideResults || !wantList) wList = null;

      const pinListMin = Boolean(forceMinListOnce && wantList);
      const pinHelperMin = Boolean(forceMinHelperOnce && wantHelper);
      const lockToMins = pinListMin || pinHelperMin;

      if (lockToMins) {
        forceMinListOnce = false;
        forceMinHelperOnce = false;

        let targetList = pinListMin ? MIN_LIST : (Number.isFinite(wList) ? wList : MIN_LIST);
        let targetHelper = pinHelperMin ? MIN_HELPER : (Number.isFinite(wHelper) ? wHelper : MIN_HELPER);

        if (!wantList) targetList = 0;
        if (!wantHelper) targetHelper = 0;

        // Give the maximum possible space to the judgment/details pane.
        let wListLocked = BI.clamp(targetList, 0, total);
        let wHelperLocked = BI.clamp(targetHelper, 0, total);
        let wDetailsLocked = total - wListLocked - wHelperLocked;

        // If details would be too small, reduce list then helper to make room.
        if (wDetailsLocked < minDetails) {
          let deficit = minDetails - wDetailsLocked;
          const reduceList = Math.min(deficit, wListLocked);
          wListLocked -= reduceList;
          deficit -= reduceList;

          if (deficit > 0) {
            const reduceHelper = Math.min(deficit, wHelperLocked);
            wHelperLocked -= reduceHelper;
            deficit -= reduceHelper;
          }

          wDetailsLocked = total - wListLocked - wHelperLocked;
        }

        if (wantList) wList = wListLocked;
        wDetails = BI.clamp(wDetailsLocked, 0, total);
        if (wantHelper) wHelper = wHelperLocked;
      } else {
        // Default splits depend on which panes are visible.
        if ((!wList && wantList) || !wDetails || (!wHelper && wantHelper)) {
          if (wantList && wantHelper) {
            wList = wList || Math.round(total * 0.38);
            wDetails = wDetails || Math.round(total * 0.42);
            wHelper = wHelper || total - wList - wDetails;
          } else if (!wantList && wantHelper) {
            wDetails = wDetails || Math.round(total * 0.58);
            wHelper = wHelper || total - wDetails;
          } else if (wantList && !wantHelper) {
            wList = wList || Math.round(total * 0.45);
            wDetails = wDetails || total - wList;
          } else {
            // Only details visible.
            wDetails = total;
          }
        }
      }

      // Always scale visible panes to fill the available width (like the original site).
      const scaleToTotal = (vals) => {
        const sum = vals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
        if (!sum || Math.abs(sum - total) < 2) return vals;
        const f = total / sum;
        return vals.map((v) => (Number.isFinite(v) ? v * f : v));
      };

      if (lockToMins) {
        // Already allocated exactly (skip proportional scaling).
      } else if (wantList && wantHelper) {
        [wList, wDetails, wHelper] = scaleToTotal([wList, wDetails, wHelper]);
        wList = BI.clamp(wList, minList, Math.max(minList, total - minDetails - minHelper));
        wDetails = BI.clamp(wDetails, minDetails, Math.max(minDetails, total - wList - minHelper));
        wHelper = total - wList - wDetails;
        wHelper = BI.clamp(wHelper, minHelper, Math.max(minHelper, total - wList - wDetails));
      } else if (!wantList && wantHelper) {
        [wDetails, wHelper] = scaleToTotal([wDetails, wHelper]);
        wDetails = BI.clamp(wDetails, minDetails, Math.max(minDetails, total - minHelper));
        wHelper = BI.clamp(total - wDetails, minHelper, Math.max(minHelper, total - wDetails));
        wDetails = total - wHelper;
      } else if (wantList && !wantHelper) {
        [wList, wDetails] = scaleToTotal([wList, wDetails]);
        wList = BI.clamp(wList, minList, Math.max(minList, total - minDetails));
        wDetails = BI.clamp(total - wList, minDetails, Math.max(minDetails, total - wList));
        wList = total - wDetails;
      } else {
        wDetails = total;
      }

      if (wantList) setFlexBasis(listPane, wList);
      setFlexBasis(detailsPane, wDetails);
      if (wantHelper) setFlexBasis(panelEl, wHelper);

      panelEl.dataset.ihSized = '1';
      panelEl.dataset.ihLayoutKey = layoutKey;
      panelEl.dataset.ihTotal = String(total);

      // Remember widths for this session.
      lastWList = wantList ? wList : lastWList;
      lastWDetails = wDetails;
      lastWHelper = wantHelper ? wHelper : lastWHelper;
    }

    const bindSplitter = (splitter, leftEl, rightEl, leftRole, rightRole) => {
      if (splitter.dataset.ihBound === '1') return;
      splitter.dataset.ihBound = '1';

      splitter.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.documentElement.classList.add('ih-resizing');
        try {
          splitter.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
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

          // Remember widths for this session only.
          const leftW = leftEl.getBoundingClientRect().width;
          const rightW = rightEl.getBoundingClientRect().width;
          if (leftRole === 'list') lastWList = leftW;
          if (leftRole === 'details') lastWDetails = leftW;
          if (leftRole === 'helper') lastWHelper = leftW;
          if (rightRole === 'list') lastWList = rightW;
          if (rightRole === 'details') lastWDetails = rightW;
          if (rightRole === 'helper') lastWHelper = rightW;
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

    if (wantList) bindSplitter(splitter1, listPane, detailsPane, 'list', 'details');
    if (wantHelper) bindSplitter(splitter2, detailsPane, panelEl, 'details', 'helper');

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

  function neutralizeLingeringBackdrops() {
    // In narrow mode, closing the filters drawer sometimes leaves behind a transparent
    // backdrop/overlay element that still captures pointer events, which prevents dragging
    // our splitters. Only apply when our docked layout is active.
    if (!document.documentElement.classList.contains('ih-has-docked')) return;

    const selectors = [
      '.cdk-overlay-backdrop',
      '.cdk-overlay-container',
      '.cdk-overlay-pane',
      '[class*="backdrop" i]',
      '[class*="overlay-backdrop" i]',
      '[class*="modal-backdrop" i]'
    ].join(',');

    const nodes = Array.from(document.querySelectorAll(selectors));
    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue;
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch {
        continue;
      }
      if (!cs) continue;
      if (cs.pointerEvents === 'none') continue;
      if (cs.position !== 'fixed') continue;

      const opacity = Number(cs.opacity || '1');
      const invisible = cs.visibility === 'hidden' || cs.display === 'none' || (Number.isFinite(opacity) && opacity < 0.05);
      if (!invisible) continue;

      // Only touch full-screen-ish layers.
      const r = el.getBoundingClientRect();
      const coversScreen = r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2;
      if (!coversScreen) continue;

      try {
        el.style.setProperty('pointer-events', 'none', 'important');
        // If it's already invisible, also remove it from layout/stacking.
        el.style.setProperty('display', 'none', 'important');
      } catch {
        // ignore
      }
    }
  }

  function bindOverlayCloseCleanup() {
    if (window.__ihOverlayCleanupBound) return;
    window.__ihOverlayCleanupBound = true;

    document.addEventListener(
      'click',
      (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;

        // Heuristics for close buttons ("X", "Fermer", icon-only close).
        const btn = t.closest('button,[role="button"]');
        if (!btn) return;
        const label = `${btn.getAttribute('aria-label') || ''} ${btn.title || ''} ${(btn.textContent || '').trim()}`.toLowerCase();
        const looksLikeClose =
          label.includes('fermer') ||
          label === 'x' ||
          label.includes('close') ||
          btn.matches('button[aria-describedby*="close" i],button[aria-label*="close" i]');
        if (!looksLikeClose) return;

        // After any overlay close, do a deferred cleanup + relayout.
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            neutralizeLingeringBackdrops();
            const p = document.getElementById('infocuria-helper');
            if (p) ensureDockedLayout(p);
          });
        });
      },
      true
    );
  }

  bindOverlayCloseCleanup();

  BI.getMainContentRoot = getMainContentRoot;
  BI.getLayoutPanes = getLayoutPanes;
  BI.ensureSplitter = ensureSplitter;
  BI.ensureDockedLayout = ensureDockedLayout;
  BI.setPanelHidden = setPanelHidden;
  BI.syncDockedTop = syncDockedTop;
  BI.ensureDockedTopSync = ensureDockedTopSync;
})();
