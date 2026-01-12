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
