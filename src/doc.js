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
    // Filter out empty paragraphs before scanning: older judgments can have many
    // leading empty <p> elements that push the date line beyond a fixed-index limit.
    const candidates = texts.filter((t) => t).slice(0, 10);
    for (const t of candidates) {
      const di = BI.parseFrenchDateFromLine(t);
      if (di) return di;
    }
    return null;
  }

  function extractHeaderLine(texts) {
    return texts.find((t) => /\b(arrêt|ordonnance|conclusions)\b/i.test(t)) || '';
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

  function getPageLanguage() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('lang');
    if (fromUrl) return fromUrl.toUpperCase();

    const fromHtml = document.documentElement.getAttribute('lang');
    if (fromHtml) return fromHtml.slice(0, 2).toUpperCase();

    return 'FR';
  }

  function parseCaseNumber(rg) {
    const clean = String(rg || '').replaceAll('‑', '-').trim();
    const m = clean.match(/^([CFT])-?(\d+)\/(\d{2,4})/i);
    if (!m) return null;

    const yy = Number(m[3]);
    const currentTwoDigitYear = new Date().getFullYear() % 100;
    const year = m[3].length === 4
      ? yy
      : yy <= currentTwoDigitYear
        ? 2000 + yy
        : 1900 + yy;

    return {
      court: m[1].toUpperCase(),
      number: m[2].padStart(4, '0'),
      year,
    };
  }

  function inferCelexDocumentType(rg, headerLine) {
    const parsed = parseCaseNumber(rg);
    if (!parsed) return null;

    const isOrder = /\bordonnance\b/i.test(headerLine || '');
    const isOpinion = /\bconclusions\b/i.test(headerLine || '');
    if (parsed.court === 'C' && isOpinion) return 'CC';
    if (parsed.court === 'C') return isOrder ? 'CO' : 'CJ';
    if (parsed.court === 'T') return isOrder ? 'TO' : 'TJ';
    if (parsed.court === 'F') return isOrder ? 'FO' : 'FJ';
    return null;
  }

  function buildCelexIdFromCaseNumber(rg, headerLine) {
    const parsed = parseCaseNumber(rg);
    const docType = inferCelexDocumentType(rg, headerLine);
    if (!parsed || !docType) return null;

    return `6${parsed.year}${docType}${parsed.number}`;
  }

  function buildCelexPdfUrl(celex, lang) {
    if (!celex) return null;
    return `https://eur-lex.europa.eu/legal-content/${encodeURIComponent(lang || 'FR')}/TXT/PDF/?uri=CELEX:${encodeURIComponent(celex)}`;
  }

  function getCelexIdFromUrl(url) {
    const m = String(url || '').match(/CELEX:([0-9A-Z]+)/i);
    return m?.[1] ? m[1].toUpperCase() : null;
  }

  function getAbsoluteHref(a) {
    const href = a?.getAttribute('href');
    if (!href) return null;
    try {
      return new URL(href, window.location.href).href;
    } catch {
      return href;
    }
  }

  function extractCelexPdfUrlFromPage(rg, headerLine) {
    const expectedCelex = buildCelexIdFromCaseNumber(rg, headerLine);
    const pdfLinks = Array.from(document.querySelectorAll('a[href*="eur-lex.europa.eu"][href*="/TXT/PDF/"][href*="CELEX:"]'));

    if (expectedCelex) {
      const exact = pdfLinks
        .map(getAbsoluteHref)
        .find((href) => getCelexIdFromUrl(href) === expectedCelex);

      if (exact) return exact;

      // Infocuria may expose several Eur-Lex PDF links inside the document text.
      // Prefer a deterministic URL for the selected judgment over the first
      // arbitrary legal-content link in document order.
      return buildCelexPdfUrl(expectedCelex, getPageLanguage());
    }

    return getAbsoluteHref(pdfLinks[0]) || null;
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

  function isAdvocateGeneralOpinion(texts, headerLine) {
    const candidates = [headerLine, ...texts.slice(0, 12)].filter(Boolean);
    return candidates.some((t) => /conclusions\s+de\s+(?:(?:M(?:me|\.)?)\s+)?l[’']avocat(?:e)?\s+g[ée]n[ée]ral(?:e)?/i.test(t));
  }

  function toNameCase(name) {
    const clean = BI.normalizeSpaces(name);
    const letters = clean.replace(/[^\p{L}]/gu, '');
    if (!letters || letters !== letters.toUpperCase()) return clean;

    return clean.toLocaleLowerCase('fr-FR').replace(
      /(^|[\s'’-])(\p{L})/gu,
      (_m, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('fr-FR')}`
    );
  }

  function normalizeAdvocateGeneralTitle(title) {
    return /^mme$/i.test(String(title || '').replace(/\.$/, '')) ? 'Mme' : 'M.';
  }

  function cleanAdvocateGeneralName(name) {
    const clean = BI.normalizeSpaces(String(name || '').replace(/^[,:\s]+|[,:\s]+$/g, ''));
    if (!clean || /^(pr[ée]sent[ée]es?|dans|affaire)\b/i.test(clean)) return '';
    return toNameCase(clean);
  }

  function parseAdvocateGeneralFromLine(line) {
    const clean = BI.normalizeSpaces(line);
    const titlePattern = '(M(?:me|\\.))';
    const agLabel = "l[’']avocat(?:e)?\\s+g[ée]n[ée]ral(?:e)?";

    const patterns = [
      new RegExp(`conclusions\\s+de\\s+${titlePattern}\\s+${agLabel}\\s+(.+)$`, 'i'),
      new RegExp(`conclusions\\s+de\\s+${agLabel}\\s+${titlePattern}\\s+(.+)$`, 'i'),
      new RegExp(`^${titlePattern}\\s+(.+)$`, 'i'),
      new RegExp(`^${agLabel}\\s+${titlePattern}\\s+(.+)$`, 'i'),
    ];

    for (const re of patterns) {
      const m = clean.match(re);
      if (!m) continue;

      const title = normalizeAdvocateGeneralTitle(m[1]);
      const name = cleanAdvocateGeneralName(m[2]);
      if (name) return { title, name };
    }

    return null;
  }

  function extractAdvocateGeneralTitleFromHeader(line) {
    const m = BI.normalizeSpaces(line).match(/conclusions\s+de\s+(M(?:me|\.))\s+l[’']avocat(?:e)?\s+g[ée]n[ée]ral(?:e)?/i);
    return m?.[1] ? normalizeAdvocateGeneralTitle(m[1]) : '';
  }

  function extractAdvocateGeneralFromPreview(texts) {
    const idx = texts.findIndex((t) => /conclusions\s+de\s+(?:(?:M(?:me|\.)?)\s+)?l[’']avocat(?:e)?\s+g[ée]n[ée]ral(?:e)?/i.test(t));
    if (idx < 0) return null;

    const candidates = texts
      .slice(idx, idx + 8)
      .map((t) => BI.normalizeSpaces(t))
      .filter(Boolean);
    const titleFromHeader = candidates.map(extractAdvocateGeneralTitleFromHeader).find(Boolean) || '';

    for (const t of candidates) {
      const ag = parseAdvocateGeneralFromLine(t);
      if (ag) return ag;
    }

    const fallback = candidates.find((t) => (
      !BI.parseFrenchDateFromLine(t)
      && !/^(pr[ée]sent[ée]es?|dans|affaire)\b/i.test(t)
      && !/conclusions\s+de\s+/i.test(t)
      && !/l[’']avocat(?:e)?\s+g[ée]n[ée]ral(?:e)?/i.test(t)
    ));
    return fallback ? { title: titleFromHeader, name: toNameCase(fallback.replace(/,$/, '')) } : null;
  }

  function formatFrenchDate(day, month, year) {
    const monthName = BI.MONTHS_FR[month - 1];
    if (!day || !monthName || !year) return '';
    return `${day} ${monthName} ${year}`;
  }

  function parseCaseMetadataText(text, rg) {
    if (!rg) return null;

    const rgNorm = BI.escapeRegExp(rg.replace('‑', '-'));
    const clean = BI.normalizeSpaces(text).replaceAll('‑', '-');
    const re = new RegExp(
      `\\b(Arrêt|Ordonnance|Conclusions),\\s*([0-9]{2})\\/([0-9]{2})\\/([0-9]{4}),\\s*(.+?)\\s*,\\s*${rgNorm}\\b(?:\\s*,\\s*(ECLI:EU:[A-Z]:\\d{4}:\\d+))?`,
      'i'
    );
    const m = clean.match(re);
    if (!m) return null;

    const day = Number(m[2]);
    const month = Number(m[3]);
    const year = Number(m[4]);
    const kind = m[1].toLowerCase();

    return {
      kind,
      dateInfo: { day, month, year, formatted: formatFrenchDate(day, month, year) },
      name: BI.normalizeSpaces(m[5].replace(/,$/, '')),
      ecli: m[6] || '',
      text: clean,
    };
  }

  function extractDecisionMetadataFromPage(rg) {
    if (!rg) return null;

    const elements = Array.from(document.querySelectorAll('button, a, [role="button"], h1, h2, h3, h4, h5'));
    const seen = new Set();
    const candidates = elements
      .map((el) => BI.normalizeSpaces(el.textContent).replaceAll('‑', '-'))
      .filter((t) => {
        if (!t || seen.has(t) || !t.includes(rg.replace('‑', '-'))) return false;
        seen.add(t);
        return true;
      });

    return candidates
      .map((t) => parseCaseMetadataText(t, rg))
      .find((meta) => meta && /^(arrêt|ordonnance)$/.test(meta.kind)) || null;
  }

  function extractOfficialCaseNameFromPage(rg) {
    if (!rg) return null;

    const decisionMeta = extractDecisionMetadataFromPage(rg);
    if (decisionMeta?.name) return decisionMeta.name;

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

  function buildOpinionReferenceHtml({ advocateGeneral, judgmentCitationHtml, ecli }) {
    const title = advocateGeneral?.title ? `${BI.escapeHtml(advocateGeneral.title)} ` : '';
    const name = advocateGeneral?.name ? ` ${BI.escapeHtml(advocateGeneral.name)}` : '';
    const safeEcli = ecli ? `, ${BI.escapeHtml(ecli)}` : '';
    return `conclusions de ${title}l'avocat général${name} avant ${judgmentCitationHtml}${safeEcli}`;
  }

  function buildStandaloneOpinionReferenceHtml({ advocateGeneral, date, name, rg, ecli }) {
    const title = advocateGeneral?.title ? `${BI.escapeHtml(advocateGeneral.title)} ` : '';
    const agName = advocateGeneral?.name ? ` ${BI.escapeHtml(advocateGeneral.name)}` : '';
    const safeDate = date ? `${BI.escapeHtml(date)}, ` : '';
    const safeName = name ? `<i>${BI.escapeHtml(name)}</i>, ` : '';
    const url = `https://infocuria.curia.europa.eu/tabs/affair?lang=FR&searchTerm=%22${encodeURIComponent(rg)}%22`;
    const safeEcli = ecli ? `, ${BI.escapeHtml(ecli)}` : '';
    return `conclusions de ${title}l'avocat général${agName}, ${safeDate}${safeName}<a href="${url}" target="_blank" rel="noopener noreferrer">${BI.escapeHtml(rg)}</a>${safeEcli}`;
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
    const isOpinion = isAdvocateGeneralOpinion(texts, headerLine);
    const decisionMeta = isOpinion ? extractDecisionMetadataFromPage(rg) : null;
    const hasRenderedDecision = Boolean(decisionMeta);
    const referenceDateInfo = hasRenderedDecision ? decisionMeta.dateInfo : dateInfo;
    const referenceHeaderLine = hasRenderedDecision ? decisionMeta.kind : headerLine;
    const jur = inferCourtPrefix(rg, referenceDateInfo, referenceHeaderLine);
    const ecli = extractECLIFromPage();

    const officialName = decisionMeta?.name || extractOfficialCaseNameFromPage(rg) || extractCaseNameFromPreview(texts) || '';

    const pdfUrl = extractCelexPdfUrlFromPage(rg, headerLine);

    const judgmentCitationHtml = buildReferenceHtml({
      jur,
      date: referenceDateInfo?.formatted || date,
      name: officialName,
      rg,
      ecli: isOpinion && hasRenderedDecision ? '' : ecli
    });

    const advocateGeneral = isOpinion ? extractAdvocateGeneralFromPreview(texts) : null;
    const citationHtml = isOpinion && hasRenderedDecision
      ? buildOpinionReferenceHtml({ advocateGeneral, judgmentCitationHtml, ecli })
      : isOpinion
        ? buildStandaloneOpinionReferenceHtml({
            advocateGeneral,
            date,
            name: officialName,
            rg,
            ecli,
          })
        : judgmentCitationHtml;

    const citationText = stripTags(citationHtml);

    // Keep a few legacy keys to minimize refactor risk.
    return {
      jur,
      date,
      rg,
      ecli,
      caseNumber: rg,
      officialName,
      advocateGeneral,
      isOpinion,
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
  BI.buildCelexIdFromCaseNumber = buildCelexIdFromCaseNumber;
  BI.buildCelexPdfUrl = buildCelexPdfUrl;
  BI.isAdvocateGeneralOpinion = isAdvocateGeneralOpinion;
  BI.extractAdvocateGeneralFromPreview = extractAdvocateGeneralFromPreview;
  BI.extractDecisionMetadataFromPage = extractDecisionMetadataFromPage;
  BI.extractCaseNameFromPreview = extractCaseNameFromPreview;
  BI.extractOfficialCaseNameFromPage = extractOfficialCaseNameFromPage;
  BI.buildReferenceHtml = buildReferenceHtml;
  BI.buildOpinionReferenceHtml = buildOpinionReferenceHtml;
  BI.buildStandaloneOpinionReferenceHtml = buildStandaloneOpinionReferenceHtml;
  BI.buildDocData = buildDocData;
})();
