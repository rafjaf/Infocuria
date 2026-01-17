(() => {
  const BI = globalThis.BetterInfocuria;

  function getDocumentPreviewRoot() {
    return document.querySelector('#panel-document-preview');
  }

  // Alias used by the rest of the codebase.
  function getPreviewRoot() {
    return getDocumentPreviewRoot();
  }

  function getPreviewParagraphTexts(root) {
    const ps = Array.from(root.querySelectorAll('p'));
    return ps.map((p) => BI.normalizeSpaces(p.textContent));
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

  function extractRGFromPreview(texts) {
    const joined = texts.join('\n');
    const m = joined.match(/[CFT][‑-]\d+\/\d+\s?[A-Z]*/);
    if (!m) return null;
    return m[0].replace('‑', '-').trim();
  }

  function extractDateFromPreview(texts) {
    for (const t of texts.slice(0, 10)) {
      const di = BI.parseFrenchDateFromLine(t);
      if (di) return di;
    }
    return null;
  }

  function extractHeaderLine(texts) {
    return texts.find((t) => /\b(arrêt|ordonnance)\b/i.test(t)) || '';
  }

  function extractECLIFromPage() {
    const btn = Array.from(document.querySelectorAll('button'))
      .map((b) => BI.normalizeSpaces(b.textContent))
      .find((t) => /ECLI:EU:/i.test(t));
    if (btn) {
      const m = btn.match(/ECLI:EU:[A-Z]:\d{4}:\d+/);
      if (m) return m[0];
    }
    return null;
  }

  function extractCelexPdfUrlFromPage() {
    const a = document.querySelector('a[href*="eur-lex.europa.eu"][href*="/TXT/PDF/"][href*="CELEX:"]');
    return a?.getAttribute('href') || null;
  }

  function extractCaseNameFromPreview(texts) {
    const idxProc = texts.findIndex((t) => /dans\s+l(?:a|es)\s+procédure(?:s)?/i.test(t));
    const idxContre = texts.findIndex((t) => /^contre$/i.test(t));

    const party1 = idxProc >= 0 ? texts.slice(idxProc + 1).find((t) => t && !/^contre$/i.test(t)) : null;
    const party2 = idxContre >= 0 ? texts.slice(idxContre + 1).find((t) => t && !/^en présence/i.test(t)) : null;

    if (party1) {
      return BI.normalizeSpaces(String(party1).replace(/,/g, ''));
    }

    const h2 = document.querySelector('h2');
    if (h2) {
      const t = BI.normalizeSpaces(h2.textContent);
      const m = t.match(/-\s*(.+)$/);
      if (m?.[1]) {
        const candidate = BI.normalizeSpaces(m[1]);
        if (!/\b\d+\/\d+\b/.test(candidate)) return candidate;
      }
    }

    return null;
  }

  function extractOfficialCaseNameFromPage(rg) {
    if (!rg) return null;

    const rgNorm = rg.replace('‑', '-');

    const expandedButtons = Array.from(document.querySelectorAll('button[aria-expanded="true"], button[expanded]'));
    const candidates = expandedButtons
      .map((b) => BI.normalizeSpaces(b.textContent).replaceAll('‑', '-'))
      .filter((t) => t && t.includes(rgNorm));

    for (const t of candidates) {
      const m = t.match(new RegExp(`${BI.escapeRegExp(rgNorm)}\\s*-\\s*(.+)$`));
      if (m?.[1]) return BI.normalizeSpaces(m[1]);
    }

    for (const t of candidates) {
      const m = t.match(
        new RegExp(
          `^([^,]+),\\s*([0-9]{2}\\/\\d{2}\\/\\d{4}),\\s*(.+?)\\s*,\\s*${BI.escapeRegExp(rgNorm)}\\b`
        )
      );
      if (m?.[3]) return BI.normalizeSpaces(m[3]);
    }

    const heading = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5'))
      .map((h) => BI.normalizeSpaces(h.textContent))
      .find((t) => t && t.includes(rgNorm) && t.includes('-'));
    if (heading) {
      const m = heading.match(new RegExp(`${BI.escapeRegExp(rgNorm)}\\s*-\\s*(.+)$`));
      if (m?.[1]) return BI.normalizeSpaces(m[1]);
    }

    return null;
  }

  function buildReferenceHtml({ jur, date, name, rg, ecli }) {
    const url = `https://infocuria.curia.europa.eu/tabs/affair?lang=FR&searchTerm=%22${encodeURIComponent(rg)}%22`;
    const safeName = name ? `<i>${BI.escapeHtml(name)}</i>, ` : '';
    const safeEcli = ecli ? `${BI.escapeHtml(ecli)}` : '';
    return `${BI.escapeHtml(jur)} ${BI.escapeHtml(date)}, ${safeName}<a href="${url}" target="_blank" rel="noopener noreferrer">${BI.escapeHtml(rg)}</a>${safeEcli ? `, ${safeEcli}` : ''}`;
  }

  function stripTags(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return BI.normalizeSpaces(tmp.textContent || '');
  }

  function buildDocData(root) {
    const texts = getPreviewParagraphTexts(root);

    const dateInfo = extractDateFromPreview(texts);
    const date = dateInfo?.formatted || '';
    const rg = extractRGFromPreview(texts) || '';
    const headerLine = extractHeaderLine(texts);
    const jur = inferCourtPrefix(rg, dateInfo, headerLine);
    const ecli = extractECLIFromPage();

    const officialName = extractOfficialCaseNameFromPage(rg) || extractCaseNameFromPreview(texts) || '';

    const pdfUrl = extractCelexPdfUrlFromPage();

    const citationHtml = buildReferenceHtml({
      jur,
      date,
      name: officialName,
      rg,
      ecli
    });

    const citationText = stripTags(citationHtml);

    // Keep a few legacy keys to minimize refactor risk.
    return {
      jur,
      date,
      rg,
      ecli,
      caseNumber: rg,
      officialName,
      pdfUrl,
      citationHtml,
      citationText,
    };
  }

  BI.getDocumentPreviewRoot = getDocumentPreviewRoot;
  BI.getPreviewRoot = getPreviewRoot;
  BI.getPreviewParagraphTexts = getPreviewParagraphTexts;
  BI.inferCourtPrefix = inferCourtPrefix;
  BI.extractRGFromPreview = extractRGFromPreview;
  BI.extractDateFromPreview = extractDateFromPreview;
  BI.extractHeaderLine = extractHeaderLine;
  BI.extractECLIFromPage = extractECLIFromPage;
  BI.extractCelexPdfUrlFromPage = extractCelexPdfUrlFromPage;
  BI.extractCaseNameFromPreview = extractCaseNameFromPreview;
  BI.extractOfficialCaseNameFromPage = extractOfficialCaseNameFromPage;
  BI.buildReferenceHtml = buildReferenceHtml;
  BI.buildDocData = buildDocData;
})();
