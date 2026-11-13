/**
 * The chat page's only browser script. Plain JavaScript, inlined into the
 * page. It contains no user data, so inlining it is safe.
 *
 * 1. Puts the cursor back in the message box. (The `autofocus` attribute is
 *    ignored when the URL has a #fragment, and we use #latest to scroll.)
 * 2. While a reply is on its way, reloads the page every few seconds, but
 *    waits while the user is typing so their draft isn't wiped.
 * 3. Starts Clerk's browser script, which renews the session in the
 *    background so a message sent after a pause isn't lost to a re-login.
 */
export const CHAT_PAGE_SCRIPT = `(function () {
  var box = document.querySelector('textarea[name="text"]');
  if (box) box.focus({ preventScroll: true });

  var pending = document.querySelector('[data-refresh-url]');
  if (pending) {
    var url = pending.getAttribute('data-refresh-url');
    var ms = (Number(pending.getAttribute('data-refresh-seconds')) || 2) * 1000;
    var tick = function () {
      if (box && box.value.trim()) { setTimeout(tick, ms); return; }
      location.replace(url);
    };
    setTimeout(tick, ms);
  }

  window.addEventListener('load', function () {
    if (window.Clerk) {
      window.Clerk.load().catch(function (err) { console.error('[clerk]', err); });
    }
  });
})();`
