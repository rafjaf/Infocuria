(() => {
  const BI = globalThis.BetterInfocuria;

  // Ported from legacy content.js
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

  const ECLI_RE = /EU:\w:\d{4}:\d+/g;

  /**
   * Walk only the Text nodes inside a paragraph, wrapping matches in
   * <span> (highlights) or <a> (ECLI links) without destroying existing
   * DOM structure (anchors carrying paragraph numbers, <b>, <sup>, etc.).
   */
  function processTextNode(node, highlightRe, highlightClass, highlightUsed) {
    const text = node.nodeValue;
    if (!text) return;

    // Skip text nodes inside anchors we must preserve (point numbers,
    // footnotes) or inside elements we already created.
    const parent = node.parentElement;
    if (parent && parent.closest(
      'a[name^="point" i], a[name^="footnote" i], a[name^="footref" i], a.ih-ecli, span.ih-hl-blue, span.ih-hl-yellow'
    )) return;

    const frag = document.createDocumentFragment();
    let remaining = text;
    let didAnything = false;

    while (remaining) {
      ECLI_RE.lastIndex = 0;
      const ecliMatch = ECLI_RE.exec(remaining);
      const ecliIdx = ecliMatch ? ecliMatch.index : -1;

      let hlIdx = -1;
      let hlMatch = null;
      if (!highlightUsed.done && highlightRe) {
        const m = remaining.match(highlightRe);
        if (m) {
          hlIdx = m.index;
          hlMatch = m[0];
        }
      }

      // Pick whichever comes first.
      let useType = null;
      let useIdx = -1;
      let useText = null;

      if (ecliIdx >= 0 && (hlIdx < 0 || ecliIdx <= hlIdx)) {
        useType = 'ecli'; useIdx = ecliIdx; useText = ecliMatch[0];
      } else if (hlIdx >= 0 && hlMatch) {
        useType = 'hl'; useIdx = hlIdx; useText = hlMatch;
      }

      if (!useType) {
        frag.appendChild(document.createTextNode(remaining));
        break;
      }

      didAnything = true;
      if (useIdx > 0) frag.appendChild(document.createTextNode(remaining.slice(0, useIdx)));

      if (useType === 'ecli') {
        const a = document.createElement('a');
        a.className = 'ih-ecli';
        a.href = `https://curia.europa.eu/juris/liste.jsf?critereEcli=${encodeURIComponent('ECLI:' + useText)}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = useText;
        frag.appendChild(a);
      } else {
        const span = document.createElement('span');
        span.className = highlightClass;
        span.textContent = useText;
        frag.appendChild(span);
        highlightUsed.done = true;
      }

      remaining = remaining.slice(useIdx + useText.length);
    }

    if (didAnything) {
      node.parentNode.replaceChild(frag, node);
    }
  }

  function applyHighlightsAndLinks(root) {
    if (!root) return;
    const ps = Array.from(root.querySelectorAll('p'));

    for (const p of ps) {
      if (p.dataset.ihProcessed === '1') continue;

      const text = p.textContent || '';

      ECLI_RE.lastIndex = 0;
      const hasEcli = ECLI_RE.test(text);

      const yellowRe = HIGHLIGHT_YELLOW.find((re) => re.test(text));
      const blueRe = HIGHLIGHT_BLUE.find((re) => re.test(text));

      if (!yellowRe && !blueRe && !hasEcli) {
        p.dataset.ihProcessed = '1';
        continue;
      }

      const highlightRe = blueRe || yellowRe || null;
      const highlightClass = blueRe ? 'ih-hl-blue' : (yellowRe ? 'ih-hl-yellow' : '');
      const highlightUsed = { done: false };

      // Collect text nodes first (modifying DOM during iteration is unsafe).
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      for (const tn of textNodes) {
        processTextNode(tn, highlightRe, highlightClass, highlightUsed);
      }

      p.dataset.ihProcessed = '1';
    }
  }

  // Kept name used by index.js
  function linkifyEcli(root) {
    applyHighlightsAndLinks(root);
    return 0;
  }

  BI.applyHighlightsAndLinks = applyHighlightsAndLinks;
  BI.linkifyEcli = linkifyEcli;
})();
