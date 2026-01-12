/*
 * Infocuria Helper
 * Injects a citation/TOC panel and adds copy + PDF download helpers.
 */

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];

const HIGHLIGHT_YELLOW = [
  /En particulier/, /Par ailleurs/, /En l’occurrence/, /Il s’ensuit/, /D'une part/, /D’autre part/,
  /^Or/, /De surcroît/, /Il résulte/, /À cet égard/, /Par conséquent/, /En conséquence/, /Tout d'abord/, /Ensuite/,
  /Dans ce contexte/, /enfin/i, /À titre liminaire/, /Plus particulièrement/, /En outre/, /De plus/, /Partant/,
  /Ainsi,/, /En effet/, /Certes/, /Dès lors/, /Dans ces conditions/, /Au surplus/, /Cependant/, /Toutefois/
];

const HIGHLIGHT_BLUE = [
  /en [\wéè]+( et dernier)? +lieu/i,
  /premièrement/i,
  /deuxièmement/i,
  /troisièmement/i,
  /quatrièmement/i,
  /cinquièmement/i
];

function normalizeSpaces(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function stripTrailingFootnote(s) {
  // e.g. "18 décembre 2025 (*)" -> "18 décembre 2025"
  return normalizeSpaces(String(s || '').replace(/\(\s*\*\s*\)\s*$/, ''));
}

function parseFrenchDateFromLine(line) {
  const clean = stripTrailingFootnote(line);
  const m = clean.match(/(\d{1,2})\s+([\p{L}]+)\s+(\d{4})/u);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthName = m[2].toLowerCase();
  const year = parseInt(m[3], 10);
  const month = MONTHS_FR.indexOf(monthName) + 1;
  if (!day || !year || month <= 0) return null;
  return { day, month, year, formatted: clean };
}

function inferCourtPrefix(rg, dateInfo, headerLine) {
  const letter = (rg || '').slice(0, 1);
  const year = dateInfo?.year;
  const month = dateInfo?.month;

  if (letter === 'C') {
    let jur;
    if (year == null || month == null) {
      jur = 'C.J.U.E.';
    } else if (year <= 2008 || (year === 2009 && month <= 11)) {
      jur = 'C.J.C.E';
    } else {
      jur = 'C.J.U.E.';
    }

    const head = (headerLine || '').toLowerCase();
    if (head.includes('grande chambre')) jur += ' (gr. ch.), ';
    else if (head.includes('plénière') || head.includes('pleniere')) jur += ' (plén.), ';
    else if (head.includes('ordonnance')) jur += ' (ord.), ';
    else jur += ', ';

    return jur;
  }

  if (letter === 'T') return 'T.P.I.U.E., ';
  if (letter === 'F') return 'T.F.P.U.E., ';
  return '';
}

function getDocumentPreviewRoot() {
  return document.querySelector('#panel-document-preview');
}

function getPreviewParagraphTexts(root) {
  const ps = Array.from(root.querySelectorAll('p'));
  return ps.map((p) => normalizeSpaces(p.textContent));
}

function extractRGFromPreview(texts) {
  // Matches C-417/23, C‑417/23, T-123/99 etc.
  const joined = texts.join('\n');
  const m = joined.match(/[CFT][‑-]\d+\/\d+\s?[A-Z]*/);
  if (!m) return null;
  return m[0].replace('‑', '-').trim();
}

function extractDateFromPreview(texts) {
  // Usually the 2nd paragraph: "18 décembre 2025 (*)"
  for (const t of texts.slice(0, 10)) {
    const di = parseFrenchDateFromLine(t);
    if (di) return di;
  }
  return null;
}

function extractHeaderLine(texts) {
  // e.g. "ARRÊT DE LA COUR (grande chambre)"
  return texts.find((t) => /\b(arrêt|ordonnance)\b/i.test(t)) || '';
}

function extractECLIFromPage() {
  // ECLI appears in the doc list button text (not necessarily inside the preview text)
  const btn = Array.from(document.querySelectorAll('button'))
    .map((b) => normalizeSpaces(b.textContent))
    .find((t) => /ECLI:EU:/i.test(t));
  if (btn) {
    const m = btn.match(/ECLI:EU:[A-Z]:\d{4}:\d+/);
    if (m) return m[0];
  }
  return null;
}

function extractCelexPdfUrlFromPage() {
  // There are direct EUR-Lex PDF links in the document list.
  const a = document.querySelector('a[href*="eur-lex.europa.eu"][href*="/TXT/PDF/"][href*="CELEX:"]');
  return a?.getAttribute('href') || null;
}

function extractCaseNameFromPreview(texts) {
  // Heuristic for parties: look for "dans les procédures" then next line, and "contre" then next line.
  const idxProc = texts.findIndex((t) => /dans\s+l(?:a|es)\s+procédure(?:s)?/i.test(t));
  const idxContre = texts.findIndex((t) => /^contre$/i.test(t));

  const party1 = idxProc >= 0 ? texts.slice(idxProc + 1).find((t) => t && !/^contre$/i.test(t)) : null;
  const party2 = idxContre >= 0 ? texts.slice(idxContre + 1).find((t) => t && !/^en présence/i.test(t)) : null;

  if (party1) {
    return normalizeSpaces(String(party1).replace(/,/g, ''));
  }

  // Fallback: use the affair title from the results heading (e.g. "C-417/23 - ...")
  const h2 = document.querySelector('h2');
  if (h2) {
    const t = normalizeSpaces(h2.textContent);
    const m = t.match(/-\s*(.+)$/);
    if (m?.[1]) {
      const candidate = normalizeSpaces(m[1]);
      // Avoid returning another reference-like token as a “name”.
      if (!/\b\d+\/\d+\b/.test(candidate)) return candidate;
    }
  }

  return null;
}

function sanitizeFilename(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPdfFilename({ officialName, rg }) {
  const rgForFile = sanitizeFilename(String(rg || 'document').replace('‑', '-').replaceAll('/', '-')) || 'document';
  const namePart = sanitizeFilename(normalizeSpaces(officialName || ''));

  const base = namePart ? `${namePart} ${rgForFile}` : rgForFile;
  const trimmed = sanitizeFilename(base).replace(/\.+$/g, (m) => m.replace(/\.+$/, '')); // avoid trailing dots

  const withExt = trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
  // Keep filenames reasonably short for cross-platform safety.
  return withExt.length > 180 ? withExt.slice(0, 180).trimEnd() : withExt;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractOfficialCaseNameFromPage(rg) {
  if (!rg) return null;

  const rgNorm = rg.replace('‑', '-');

  const expandedButtons = Array.from(document.querySelectorAll('button[aria-expanded="true"], button[expanded]'));
  const candidates = expandedButtons
    .map((b) => normalizeSpaces(b.textContent).replaceAll('‑', '-'))
    .filter((t) => t && t.includes(rgNorm));

  // 1) Affaires tab: "C-259/24 - Tenergie (....)"
  for (const t of candidates) {
    const m = t.match(new RegExp(`${escapeRegExp(rgNorm)}\\s*-\\s*(.+)$`));
    if (m?.[1]) return normalizeSpaces(m[1]);
  }

  // 2) Jurisprudence tab: "Arrêt, 18/12/2025, Tenergie (...), C-259/24, ECLI:..."
  for (const t of candidates) {
    const m = t.match(
      new RegExp(
        `^([^,]+),\\s*([0-9]{2}\\/\\d{2}\\/\\d{4}),\\s*(.+?)\\s*,\\s*${escapeRegExp(rgNorm)}\\b`
      )
    );
    if (m?.[3]) return normalizeSpaces(m[3]);
  }

  // 3) Details header often repeats the official title.
  const heading = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5'))
    .map((h) => normalizeSpaces(h.textContent))
    .find((t) => t && t.includes(rgNorm) && t.includes('-'));
  if (heading) {
    const m = heading.match(new RegExp(`${escapeRegExp(rgNorm)}\\s*-\\s*(.+)$`));
    if (m?.[1]) return normalizeSpaces(m[1]);
  }

  return null;
}

function buildReferenceHtml({ jur, date, name, rg, ecli }) {
  const url = `https://infocuria.curia.europa.eu/tabs/affair?lang=FR&searchTerm=%22${encodeURIComponent(rg)}%22`;
  const safeName = name ? `<i>${escapeHtml(name)}</i>, ` : '';
  const safeEcli = ecli ? `${escapeHtml(ecli)}` : '';
  return `${escapeHtml(jur)} ${escapeHtml(date)}, ${safeName}<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(rg)}</a>${safeEcli ? `, ${safeEcli}` : ''}`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getMainContentRoot() {
  // Primary layout container for results + info panel in Infocuria.
  return document.getElementById('main-content');
}

function isVisible(el) {
  if (!el) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function pickDetailsPane(children) {
  // Best-effort: details pane usually contains the information panel containers.
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
    const h = Array.from(el.querySelectorAll('h1,h2,h3,h4,h5'))
      .find((x) => /Liste des affaires/i.test((x.textContent || '').trim()));
    return Boolean(h);
  });
  if (byHeading) return byHeading;

  // Fallback: pick the left-most pane.
  return children.slice().sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)[0] || null;
}

function getLayoutPanes() {
  const mainContent = getMainContentRoot();
  if (!mainContent) return null;

  // Infocuria is an SPA and the component tag names differ between tabs.
  // We avoid hardcoding app-* tags and instead pick the two visible children panes.
  const children = Array.from(mainContent.children).filter(
    (el) => el.id !== 'infocuria-helper' && !el.classList.contains('ih-splitter')
  );

  const visibleChildren = children.filter(isVisible);
  if (visibleChildren.length < 2) return null;

  const detailsPane = pickDetailsPane(visibleChildren) || visibleChildren.slice().sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)[1];
  if (!detailsPane) return null;

  const listCandidates = visibleChildren.filter((el) => el !== detailsPane);
  const listPane = pickListPane(listCandidates);
  if (!listPane) return null;

  if (!listPane || !detailsPane) return null;
  return { mainContent, listPane, detailsPane };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function px(n) {
  return `${Math.round(n)}px`;
}

function readNumber(key) {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function writeNumber(key, value) {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // ignore
  }
}

function setFlexBasis(el, valuePx) {
  el.style.setProperty('flex', `0 0 ${px(valuePx)}`, 'important');
  el.style.setProperty('max-width', px(valuePx), 'important');
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

function ensureDockedLayout(panelEl) {
  const panes = getLayoutPanes();
  if (!panes) {
    // Ensure we fall back to floating mode when docking isn't possible.
    panelEl.classList.add('ih-floating');
    panelEl.classList.remove('ih-docked');
    if (panelEl.parentElement !== document.body) {
      document.body.appendChild(panelEl);
    }
    return false;
  }

  const { mainContent, listPane, detailsPane } = panes;

  // Make sure the helper is a sibling (third column) inside main-content.
  if (panelEl.parentElement !== mainContent) {
    panelEl.classList.add('ih-docked');
    panelEl.classList.remove('ih-floating');
    mainContent.appendChild(panelEl);
  }
  // If it is already in mainContent, still enforce docked class.
  panelEl.classList.add('ih-docked');
  panelEl.classList.remove('ih-floating');

  // Insert splitters: list | splitter1 | details | splitter2 | helper
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

  // Apply initial widths.
  // IMPORTANT: measure splitter width; hardcoding can cause slow drift if CSS changes.
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

  let wList = readNumber('ih:w:list');
  let wDetails = readNumber('ih:w:details');
  let wHelper = readNumber('ih:w:helper');

  if (needsSizing) {
    if (!wList || !wDetails || !wHelper || wList + wDetails + wHelper > total + 5) {
      wList = Math.round(total * 0.38);
      wDetails = Math.round(total * 0.42);
      wHelper = total - wList - wDetails;
    }

    // Clamp and ensure sum fits.
    wList = clamp(wList, minList, total - minDetails - minHelper);
    wDetails = clamp(wDetails, minDetails, total - wList - minHelper);
    wHelper = total - wList - wDetails;
    wHelper = clamp(wHelper, minHelper, total - wList - wDetails);

    // Rebalance if clamping changed helper.
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

  // Drag behavior
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

      const minLeft = leftEl === listPane ? minList : (leftEl === detailsPane ? minDetails : minHelper);
      const minRight = rightEl === listPane ? minList : (rightEl === detailsPane ? minDetails : minHelper);

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        let newLeft = clamp(leftStart + dx, minLeft, leftStart + rightStart - minRight);
        let newRight = leftStart + rightStart - newLeft;

        setFlexBasis(leftEl, newLeft);
        setFlexBasis(rightEl, newRight);
      };

      const onUp = () => {
        splitter.classList.remove('ih-active');
        document.documentElement.classList.remove('ih-resizing');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);

        writeNumber(leftKey, leftEl.getBoundingClientRect().width);
        writeNumber(rightKey, rightEl.getBoundingClientRect().width);
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

  // Align helper sticky-top with the details header (tab bar).
  const tablist = detailsPane.querySelector('[role="tablist"]');
  const topPx = Math.max(0, Math.round((tablist || detailsPane).getBoundingClientRect().top));
  panelEl.style.setProperty('--ih-docked-top', px(topPx));

  bindSplitter(splitter1, listPane, detailsPane, 'ih:w:list', 'ih:w:details');
  bindSplitter(splitter2, detailsPane, panelEl, 'ih:w:details', 'ih:w:helper');

  // Keep layout sane on window resize (cheap recalculation).
  if (!window.__ihResizeBound) {
    window.__ihResizeBound = true;
    window.addEventListener('resize', () => {
      const p = document.getElementById('infocuria-helper');
      if (!p) return;
      // Re-run sizing using stored widths.
      ensureDockedLayout(p);
    });
  }

  return true;
}

function findParagraphNumberForSelection(root) {
  const sel = document.getSelection();
  if (!sel || !sel.toString()) return null;

  let node = sel.anchorNode;
  if (!node) return null;

  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const p = el?.closest?.('p');
  if (!p || !root.contains(p)) return null;

  const t = normalizeSpaces(p.textContent);
  const m = t.match(/^(\d+)\b/);
  return m ? m[1] : null;
}

async function writeClipboardText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildQuoteText({ refText, selectedText, point }) {
  if (selectedText) {
    const quote = `"${selectedText.trim()}" (${refText}${point ? `, point ${point}` : ''})`;
    return quote;
  }
  return `${refText}, point `;
}

function getRefTextPlainFromPanel(panel) {
  // Convert the HTML ref to plain text, preserving the RG string.
  const refEl = panel.querySelector('.ih-ref');
  return normalizeSpaces(refEl?.innerText || '');
}

function buildTocItems(root) {
  const ps = Array.from(root.querySelectorAll('p'));

  const headingPatterns = [
    /^Le cadre juridique$/i,
    /^Les litiges au principal/i,
    /^Sur les questions préjudicielles/i,
    /^Sur la/i,
    /^Sur le/i,
    /^Par ces motifs/i,
    /^Arrêt$/i,
    /^Ordonnance$/i,
    /^Signatures$/i
  ];

  const items = [];

  for (const p of ps) {
    const text = normalizeSpaces(p.textContent);
    if (!text) continue;

    // Ignore numbered paragraphs (points)
    if (/^\d+\b/.test(text)) continue;

    if (headingPatterns.some((re) => re.test(text))) {
      items.push({ el: p, title: text });
    }
  }

  // Dedupe by title
  const seen = new Set();
  return items.filter((it) => {
    const key = it.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 40);
}

function ensureAnchorsForToc(items) {
  let idx = 1;
  for (const it of items) {
    if (!it.el.id) {
      it.el.id = `ih-toc-${idx++}`;
    }
    it.href = `#${it.el.id}`;
  }
}

function applyHighlightsAndLinks(root) {
  const ps = Array.from(root.querySelectorAll('p'));

  for (const p of ps) {
    // Avoid repeatedly rewriting
    if (p.dataset.ihProcessed === '1') continue;

    const text = p.textContent || '';

    // Linkify ECLI occurrences
    const ecliMatch = text.match(/EU:\w:\d{4}:\d+/);
    const hasEcli = Boolean(ecliMatch);

    const yellowRe = HIGHLIGHT_YELLOW.find((re) => re.test(text));
    const blueRe = HIGHLIGHT_BLUE.find((re) => re.test(text));

    if (!yellowRe && !blueRe && !hasEcli) {
      p.dataset.ihProcessed = '1';
      continue;
    }

    let html = escapeHtml(text);

    if (blueRe) {
      html = html.replace(blueRe, (m) => `<span class="ih-hl-blue">${escapeHtml(m)}</span>`);
    } else if (yellowRe) {
      html = html.replace(yellowRe, (m) => `<span class="ih-hl-yellow">${escapeHtml(m)}</span>`);
    }

    if (hasEcli) {
      html = html.replace(/(EU:\w:\d{4}:\d+)/g, (m) => {
        const url = `https://curia.europa.eu/juris/liste.jsf?critereEcli=${encodeURIComponent('ECLI:' + m)}`;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(m)}</a>`;
      });
    }

    p.innerHTML = html;
    p.dataset.ihProcessed = '1';
  }
}

function createOrUpdatePanel(docData, tocItems) {
  let panel = document.querySelector('#infocuria-helper');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'infocuria-helper';
    panel.className = 'ih-floating';
    panel.innerHTML = `
      <div class="ih-header">
        <div class="ih-title">Better Infocuria</div>
        <button type="button" class="ih-copy">Copy</button>
        <button type="button" class="ih-pdf">Download</button>
      </div>
      <div class="ih-body">
        <div class="ih-ref"></div>
        <div class="ih-muted" style="margin-top:6px">Select text and press Copy / Ctrl+C.</div>
        <div class="ih-toc"></div>
      </div>
    `;
    // Attach immediately; we will reparent into the docked layout when possible.
    document.body.appendChild(panel);
  }

  panel.querySelector('.ih-ref').innerHTML = docData.refHtml;
  panel.dataset.ihRg = docData.rg || '';
  panel.dataset.ihName = docData.name || '';

  const tocEl = panel.querySelector('.ih-toc');
  if (tocItems.length) {
    tocEl.innerHTML = `<div class="ih-toc-title">Table of contents</div><ul>${tocItems
      .map((it) => `<li><a href="${it.href}">${escapeHtml(it.title)}</a></li>`)
      .join('')}</ul>`;
  } else {
    tocEl.innerHTML = '';
  }

  return panel;
}

function attachPanelHandlers(panel, root) {
  const onCopy = async () => {
    const selected = document.getSelection()?.toString() || '';
    const point = selected ? findParagraphNumberForSelection(root) : null;
    const refText = getRefTextPlainFromPanel(panel);
    const quote = buildQuoteText({ refText, selectedText: selected, point });

    const ok = await writeClipboardText(quote);
    if (!ok) {
      console.warn('Infocuria Helper: clipboard write failed');
    }
  };

  const onPdf = async () => {
    const celexPdfUrl = extractCelexPdfUrlFromPage();
    if (!celexPdfUrl) {
      alert('No EUR-Lex PDF link found on this page.');
      return;
    }
    const rg = panel.dataset.ihRg || extractRGFromPreview(getPreviewParagraphTexts(root)) || 'document';
    const officialName = panel.dataset.ihName || extractOfficialCaseNameFromPage(rg) || '';
    const filename = buildPdfFilename({ officialName, rg });

    chrome.runtime.sendMessage({ type: 'download', url: celexPdfUrl, filename }, (resp) => {
      if (!resp?.ok) {
        console.warn('Infocuria Helper: download failed', resp?.error);
        alert('Download failed. Check Chrome downloads/permissions.');
      }
    });
  };

  const copyBtn = panel.querySelector('.ih-copy');
  const pdfBtn = panel.querySelector('.ih-pdf');
  const tocEl = panel.querySelector('.ih-toc');

  if (copyBtn && !copyBtn.dataset.ihBound) {
    copyBtn.dataset.ihBound = '1';
    copyBtn.addEventListener('click', onCopy);
  }

  if (pdfBtn && !pdfBtn.dataset.ihBound) {
    pdfBtn.dataset.ihBound = '1';
    pdfBtn.addEventListener('click', onPdf);
  }

  if (tocEl && tocEl.dataset.ihBound !== '1') {
    tocEl.dataset.ihBound = '1';
    tocEl.addEventListener('click', (e) => {
      const a = e.target?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('#')) return;

      const id = href.slice(1);
      if (!id) return;

      const target = root.querySelector(`#${CSS.escape(id)}`) || document.getElementById(id);
      if (!target) return;

      // Prevent SPA/hash navigation; just scroll within the existing preview.
      e.preventDefault();
      e.stopPropagation();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Optional: override Ctrl+C within the document preview only.
  if (!document.body.dataset.ihCopyHandler) {
    document.body.dataset.ihCopyHandler = '1';
    document.addEventListener('copy', (e) => {
      const sel = document.getSelection();
      if (!sel || !sel.toString()) return;
      if (!root.contains(sel.anchorNode)) return;

      // Try to replace the default clipboard content.
      e.preventDefault();
      onCopy();
    });
  }
}

function buildDocData(root) {
  const texts = getPreviewParagraphTexts(root);

  const dateInfo = extractDateFromPreview(texts);
  const date = dateInfo?.formatted || '';
  const rg = extractRGFromPreview(texts) || '';
  const headerLine = extractHeaderLine(texts);
  const jur = inferCourtPrefix(rg, dateInfo, headerLine);
  const ecli = extractECLIFromPage();

  const name = extractOfficialCaseNameFromPage(rg) || extractCaseNameFromPreview(texts);

  const refHtml = buildReferenceHtml({
    jur,
    date,
    name,
    rg,
    ecli
  });
  return { jur, date, name, rg, ecli, refHtml };
}

function initOnRoot(root) {
  if (!root) return;

  applyHighlightsAndLinks(root);

  const docData = buildDocData(root);
  if (!docData.rg || !docData.date) {
    // Not a judgment preview we can parse.
    return;
  }

  const tocItems = buildTocItems(root);
  ensureAnchorsForToc(tocItems);

  const panel = createOrUpdatePanel(docData, tocItems);
  // Prefer docking into the main layout if possible (desktop view).
  ensureDockedLayout(panel);
  attachPanelHandlers(panel, root);
}

function start() {
  // Works when the panel is already open.
  const root = getDocumentPreviewRoot();
  if (root) initOnRoot(root);

  // Watch for SPA updates / opening the preview panel.
  // Important: Infocuria is very dynamic and we also mutate the DOM (highlighting, panel).
  // Without throttling, a full-document subtree observer can cause a tight loop and freeze the page.
  let suppressObserver = false;
  let scheduled = false;

  const scheduleInit = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      suppressObserver = true;
      try {
        // Always try to dock any existing panel when the SPA changes.
        const existingPanel = document.getElementById('infocuria-helper');
        if (existingPanel) ensureDockedLayout(existingPanel);

        const r = getDocumentPreviewRoot();
        if (r) initOnRoot(r);
      } finally {
        suppressObserver = false;
      }
    }, 200);
  };

  const obs = new MutationObserver(() => {
    if (suppressObserver) return;
    scheduleInit();
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
}

start();
