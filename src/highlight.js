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

  function applyHighlightsAndLinks(root) {
    if (!root) return;
    const ps = Array.from(root.querySelectorAll('p'));

    for (const p of ps) {
      if (p.dataset.ihProcessed === '1') continue;

      const text = p.textContent || '';

      const ecliMatch = text.match(/EU:\w:\d{4}:\d+/);
      const hasEcli = Boolean(ecliMatch);

      const yellowRe = HIGHLIGHT_YELLOW.find((re) => re.test(text));
      const blueRe = HIGHLIGHT_BLUE.find((re) => re.test(text));

      if (!yellowRe && !blueRe && !hasEcli) {
        p.dataset.ihProcessed = '1';
        continue;
      }

      let html = BI.escapeHtml(text);

      if (blueRe) {
        html = html.replace(blueRe, (m) => `<span class=\"ih-hl-blue\">${BI.escapeHtml(m)}</span>`);
      } else if (yellowRe) {
        html = html.replace(yellowRe, (m) => `<span class=\"ih-hl-yellow\">${BI.escapeHtml(m)}</span>`);
      }

      if (hasEcli) {
        html = html.replace(/(EU:\w:\d{4}:\d+)/g, (m) => {
          const url = `https://curia.europa.eu/juris/liste.jsf?critereEcli=${encodeURIComponent('ECLI:' + m)}`;
          return `<a class=\"ih-ecli\" href=\"${url}\" target=\"_blank\" rel=\"noopener noreferrer\">${BI.escapeHtml(m)}</a>`;
        });
      }

      p.innerHTML = html;
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
