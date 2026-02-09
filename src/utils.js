(() => {
  const BI = globalThis.BetterInfocuria;

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

  function normalizeSpaces(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function stripTrailingFootnote(s) {
    return normalizeSpaces(String(s || '').replace(/\(\s*(?:\*|\d+)\s*\)\s*$/, ''));
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

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function sanitizeFilename(name) {
    return String(name || '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildPdfFilenameFromParts(officialName, rg) {
    const rgForFile = sanitizeFilename(String(rg || 'document').replace('‑', '-').replaceAll('/', '-')) || 'document';
    const namePart = sanitizeFilename(normalizeSpaces(officialName || ''));

    const base = namePart ? `${namePart} ${rgForFile}` : rgForFile;
    const trimmed = sanitizeFilename(base).replace(/\.+$/g, '');

    const withExt = trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
    return withExt.length > 180 ? withExt.slice(0, 180).trimEnd() : withExt;
  }

  // Backwards-compatible signature:
  // - buildPdfFilename({officialName, rg})
  // - buildPdfFilename(officialName, rg)
  function buildPdfFilename(arg1, arg2) {
    if (arg1 && typeof arg1 === 'object') {
      return buildPdfFilenameFromParts(arg1.officialName, arg1.rg);
    }
    return buildPdfFilenameFromParts(arg1, arg2);
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function px(n) {
    return `${Math.round(n)}px`;
  }

  function isVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  BI.MONTHS_FR = MONTHS_FR;
  BI.normalizeSpaces = normalizeSpaces;
  BI.stripTrailingFootnote = stripTrailingFootnote;
  BI.parseFrenchDateFromLine = parseFrenchDateFromLine;
  BI.escapeHtml = escapeHtml;
  BI.sanitizeFilename = sanitizeFilename;
  BI.buildPdfFilename = buildPdfFilename;
  BI.escapeRegExp = escapeRegExp;
  BI.clamp = clamp;
  BI.px = px;
  BI.isVisible = isVisible;
})();
