# Infocuria Helper (Chrome extension)

This is a simple Manifest V3 Chrome extension that adds a citation panel + copy helper + PDF download shortcut on **InfoCuria**.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (repo root)

## Use

- Go to an Infocuria case (example):
  - https://infocuria.curia.europa.eu/tabs/affair?lang=FR&searchTerm=%22C-417%2F23%22&sort=INTRODUCTION_DATE-DESC
- Click the **Arrêt** document in the results to open the document preview panel.
- A floating panel will appear on the right.

Features:

- **Copy** button: copies a formatted reference; if text is selected, includes the paragraph number when it can be detected.
- **PDF** button: downloads (via EUR-Lex) the PDF when a CELEX PDF link is available.
- Basic inline highlighting and ECLI linkification within the document preview.

## Notes

- The extension avoids hard-coding internal Infocuria APIs; it only reads the DOM.
- If Infocuria changes its markup, the selectors in `content.js` may need updates.
