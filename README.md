# DriveManager

**DriveManager** is a cross-browser extension (Firefox + Chromium) that makes uploading and downloading files to cloud storage **safe, resumable, and user-friendly** without needing heavy native clients.

---

## Features (Planned)

- Cross-browser (Firefox Manifest V2, Chromium Manifest V3)
- Shared code via [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)
- Background + popup communication demo
- Safe downloads
  - Pause / resume downloads
  - Resume after browser restart or crash
  - Progress tracking + speed info
- Safe uploads
  - Chunked uploads to cloud drives (Google Drive, OneDrive, etc.)
  - Resume uploads after failure / disconnect
  - Drag-and-drop UI for files
- Visual UI
  - Popup showing transfer list
  - Per-file progress bars
  - Notifications on success / failure

---

## Why DriveManager?

Most cloud storage providers handle uploads poorly in browsers:
- Large files often fail if the connection drops
- Uploads can’t be paused and resumed reliably
- Native clients exist, but are **heavy**, not cross-platform friendly, and not integrated with the browser

DriveManager fills this gap by:
- Using **official APIs** for resumable uploads & downloads
- Running **entirely inside the browser**
- Giving users fine-grained control (pause, resume, cancel)

Target audience includes:
- Students and researchers uploading huge datasets
- Linux users who don’t want native sync clients
- Anyone who wants **safer file transfers** in the browser