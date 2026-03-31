// timer-worker.js — runs in a Web Worker, immune to background tab throttling
self.onmessage = function (e) {
  const { id, ms } = e.data;
  setTimeout(() => {
    self.postMessage({ id });
  }, ms);
};
