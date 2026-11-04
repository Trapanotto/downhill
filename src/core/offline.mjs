import { $ } from './dom.mjs';

const waitForActivation = worker =>
  new Promise((resolve, reject) => {
    if (worker.state === 'activated') return resolve();
    const timeout = setTimeout(() => reject(Error('Offline-Modul konnte nicht aktiviert werden.')), 45000);
    const check = () => {
      if (worker.state === 'activated') {
        clearTimeout(timeout);
        worker.removeEventListener('statechange', check);
        resolve();
      } else if (worker.state === 'redundant') {
        clearTimeout(timeout);
        reject(Error('Bitte Seite neu laden und erneut speichern.'));
      }
    };
    worker.addEventListener('statechange', check);
    check();
  });

const cacheGame = worker =>
  new Promise((resolve, reject) => {
    const channel = new MessageChannel(),
      timeout = setTimeout(
        () => reject(Error('Zeitüberschreitung beim Speichern. Bitte online erneut versuchen.')),
        120000
      );
    channel.port1.onmessage = e => {
      clearTimeout(timeout);
      e.data.ok ? resolve() : reject(Error(e.data.error));
    };
    worker.postMessage({ type: 'CACHE_GAME' }, [channel.port2]);
  });

/** Asks the build-generated service worker to cache the whole game package. */
export async function saveOffline(base) {
  const button = $('offline-save'),
    status = $('offline-status');
  button.disabled = true;
  status.textContent = 'Das gesamte Spielpaket wird auf diesem Gerät gespeichert …';
  try {
    if (!('serviceWorker' in navigator)) throw Error('Dieser Browser unterstützt keine Offline-Speicherung.');
    const reg = await navigator.serviceWorker.register(base + 'sw.js');
    await navigator.serviceWorker.ready;
    const worker = reg.installing || reg.waiting || reg.active;
    await waitForActivation(worker);
    await cacheGame(worker);
    status.textContent = 'Bereit. Du kannst das Spiel jetzt auch ohne Internet öffnen.';
    button.textContent = 'OFFLINE GESPEICHERT ✓';
  } catch (e) {
    status.textContent = e.message;
    button.disabled = false;
  }
}
