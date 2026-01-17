const versionEl = document.getElementById('version');
if (versionEl) {
  const version = chrome.runtime.getManifest().version;
  versionEl.textContent = `v${version}`;
}

const openBtn = document.getElementById('open-infocuria');
if (openBtn) {
  openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://infocuria.curia.europa.eu' });
    window.close();
  });
}
