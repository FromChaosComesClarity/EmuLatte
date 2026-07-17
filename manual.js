// Independent manual-viewer window. Loaded via loadFile('manual.html', { query }) so it carries
// the PDF path, game identity, and the desktop theme colours in the query string. Uses the shared
// preload (window.api) for window controls, "open externally", and promoting a cached manual to
// the offline library.

const params  = new URLSearchParams(location.search);
const file    = params.get('file')   || '';
const title   = params.get('title')  || 'Manual';
const system  = params.get('system') || '';
const logo    = params.get('logo')   || '';
const gameId  = Number(params.get('gameId') || 0);
const isCache = params.get('cache') === '1';

// Match the desktop's active theme.
try {
    const theme = JSON.parse(params.get('theme') || '{}');
    const root = document.documentElement;
    Object.keys(theme).forEach(k => root.style.setProperty('--' + k, theme[k]));
    if (theme.bg) document.body.style.background = 'var(--bg)';
} catch {}

// Identity: prefer the game's logo art, fall back to its title.
document.title = 'Manual — ' + title;
const titleEl = document.getElementById('m-title');
const logoEl  = document.getElementById('m-logo');
titleEl.textContent = title;
if (logo) {
    logoEl.onload  = () => { logoEl.style.display = 'block'; titleEl.style.display = 'none'; };
    logoEl.onerror = () => { logoEl.style.display = 'none';  titleEl.style.display = 'block'; };
    logoEl.src = logo;
}
if (system) {
    const badge = document.getElementById('m-system');
    badge.textContent = system;
    badge.style.display = 'inline-block';
}

// Saved / cached state pill + "Keep offline" / "Delete" actions. A saved manual can be deleted
// from disk here; a cached one is discarded when the window closes, so it shows "Keep" instead.
const keepBtn = document.getElementById('m-keep');
const delBtn  = document.getElementById('m-delete');
const delLbl  = delBtn.querySelector('.m-del-label');
const stateEl = document.getElementById('m-state');
function showKept() {
    stateEl.textContent = 'Saved offline';
    stateEl.className = 'm-pill kept';
    stateEl.style.display = 'inline-block';
    keepBtn.style.display = 'none';
    delBtn.style.display  = 'inline-flex';   // an offline copy exists → offer to delete it
}
if (isCache) {
    stateEl.textContent = 'Cached · not saved';
    stateEl.className = 'm-pill cache';
    stateEl.style.display = 'inline-block';
    keepBtn.style.display = 'inline-flex';
    keepBtn.onclick = async () => {
        keepBtn.disabled = true;
        const res = await window.api.keepManual(gameId);
        if (res && res.ok) showKept();
        else keepBtn.disabled = false;
    };
} else {
    showKept();
}

// Delete the downloaded manual — two-step so a stray click can't wipe it. Closing after deletion
// leaves nothing behind (main also discards any cache file on close).
let delArmed = false, delTimer = null;
function disarmDelete() { delArmed = false; delBtn.classList.remove('danger'); delLbl.textContent = 'Delete'; clearTimeout(delTimer); }
delBtn.onclick = async () => {
    if (!delArmed) {
        delArmed = true;
        delBtn.classList.add('danger');
        delLbl.textContent = 'Confirm?';
        delTimer = setTimeout(disarmDelete, 3000);
        return;
    }
    clearTimeout(delTimer);
    delBtn.disabled = true;
    delLbl.textContent = 'Deleting…';
    await window.api.deleteManual(gameId);
    window.api.close();
};

// Load the PDF into Chromium's built-in viewer (page nav / zoom / search / thumbnails come free).
const pdfUrl = 'file://' + encodeURI(file).replace(/#/g, '%23') + '#toolbar=1&navpanes=0&view=FitH';
document.getElementById('m-pdf').src = pdfUrl;

// Window / file actions.
document.getElementById('m-open').onclick  = () => window.api.openPath(file);
document.getElementById('m-min').onclick   = () => window.api.minimize();
document.getElementById('m-close').onclick = () => window.api.close();
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.api.close();
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) window.api.close();
});
