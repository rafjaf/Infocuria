const pendingFilenamesByCelex = new Map();

function extractCelexId(url) {
  const m = String(url || '').match(/CELEX:([0-9A-Z]+)/i);
  return m ? m[1].toUpperCase() : null;
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const celex = extractCelexId(item.finalUrl || item.url);
  if (!celex) return;

  const entry = pendingFilenamesByCelex.get(celex);
  if (!entry) return;

  pendingFilenamesByCelex.delete(celex);
  suggest({ filename: entry.filename, conflictAction: 'uniquify' });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'download' && typeof msg.url === 'string') {
      let filename = typeof msg.filename === 'string' ? msg.filename : undefined;
      if (filename != null) {
        filename = String(filename)
          .replace(/[\\/]+/g, '-')
          .replace(/\s+/g, ' ')
          .trim();
        if (!filename) filename = undefined;
        else if (!filename.toLowerCase().endsWith('.pdf')) filename = `${filename}.pdf`;
      }

      const celex = extractCelexId(msg.url);
      if (celex && filename) {
        // Ensure we can override any server-provided filename like "CELEX_...".
        pendingFilenamesByCelex.set(celex, { filename, ts: Date.now() });
      }

      try {
        const downloadId = await chrome.downloads.download({
          url: msg.url,
          filename,
          saveAs: false
        });
        sendResponse({ ok: true, downloadId });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    }
  })();

  // Keep the message channel open for async response.
  return true;
});
