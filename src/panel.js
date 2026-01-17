(() => {
  const BI = globalThis.BetterInfocuria;

  function buildCopyPayload(doc, selectionText, pointNumber) {
    const refText = (doc?.citationText || '').trim();
    const refHtml = String(doc?.citationHtml || '');

    const selText = selectionText ? String(selectionText).trim() : '';
    const point = pointNumber != null && pointNumber !== '' ? String(pointNumber) : '';

    const plain = selText
      ? `"${selText}" (${refText}${point ? `, point ${point}` : ''})`
      : `${refText}, point `;

    const escapedSelHtml = selText ? BI.escapeHtml(selText).replace(/\n/g, '<br>') : '';
    const html = selText
      ? `&ldquo;${escapedSelHtml}&rdquo; (${refHtml}${point ? `, point ${BI.escapeHtml(point)}` : ''})`
      : `${refHtml}, point `;

    return { plain, html };
  }

  function writeClipboardPayload(payload) {
    if (!payload) return Promise.reject(new Error('Missing payload'));

    // Prefer rich clipboard.
    if (window.ClipboardItem && navigator.clipboard?.write) {
      return navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([payload.plain], { type: 'text/plain' }),
          'text/html': new Blob([payload.html], { type: 'text/html' }),
        }),
      ]);
    }

    // Fallback: plain text only.
    return navigator.clipboard.writeText(payload.plain);
  }

  function ensurePanel() {
    let panel = document.getElementById('infocuria-helper');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'infocuria-helper';
    panel.className = 'ih-panel ih-docked';

    panel.innerHTML = `
      <div class="ih-header">
        <div class="ih-title">Better Infocuria</div>
      </div>
      <div class="ih-body">
        <div class="ih-section">
          <div class="ih-row">
            <button class="ih-btn" data-action="copy">Copy</button>
            <button class="ih-btn" data-action="download">Download</button>
          </div>
          <div class="ih-row">
            <div class="ih-citation" data-role="citation"></div>
          </div>
        </div>
        <div class="ih-section">
          <div class="ih-subtitle">Table of contents</div>
          <div class="ih-toc" data-role="toc"></div>
        </div>
      </div>
    `.trim();

    document.body.appendChild(panel);
    return panel;
  }

  function setCitationHtml(panel, html) {
    const el = panel.querySelector('[data-role="citation"]');
    if (!el) return;
    el.innerHTML = html || '';
  }

  function setTocItems(panel, items, getPreviewRoot) {
    const toc = panel.querySelector('[data-role="toc"]');
    if (!toc) return;

    BI.renderToc(toc, items);
    BI.attachTocClickHandler(toc, getPreviewRoot);
  }

  function attachPanelHandlers(panel, opts) {
    if (panel.dataset.ihHandlersBound === '1') return;
    panel.dataset.ihHandlersBound = '1';

    const { getDocData, getSelectionText, getParagraphForSelection, onToast } = opts;

    const toast = (msg) => {
      if (typeof onToast === 'function') onToast(msg);
    };

    panel.addEventListener('click', async (e) => {
      const btn = e.target instanceof Element ? e.target.closest('button[data-action]') : null;
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      if (!action) return;

      if (action === 'download') {
        const doc = getDocData();
        if (!doc?.pdfUrl) {
          toast('No PDF link found.');
          return;
        }

        const filename = BI.buildPdfFilename(doc.officialName || doc.caseNumber || 'Document', doc.caseNumber || '');
        chrome.runtime.sendMessage({ type: 'download', url: doc.pdfUrl, filename }, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) {
            toast(`Download failed: ${err.message}`);
            return;
          }
          if (resp && resp.ok) toast('Download started.');
        });

        return;
      }

      if (action === 'copy') {
        const doc = getDocData();
        if (!doc) {
          toast('No document detected.');
          return;
        }

        const selection = (typeof getSelectionText === 'function' ? getSelectionText() : '') || '';
        const para = typeof getParagraphForSelection === 'function' ? getParagraphForSelection() : null;

        try {
          const payload = buildCopyPayload(doc, selection, para?.number);
          await writeClipboardPayload(payload);
          toast('Copied.');
        } catch {
          toast('Copy failed.');
        }

        return;
      }
    });
  }

  BI.ensurePanel = ensurePanel;
  BI.setCitationHtml = setCitationHtml;
  BI.setTocItems = setTocItems;
  BI.attachPanelHandlers = attachPanelHandlers;
  BI.buildCopyPayload = buildCopyPayload;
  BI.writeClipboardPayload = writeClipboardPayload;
})();
