/* Cookieless, anonymous analytics for the hosted pages only (ua5er.github.io).
 * No SDK, no cookies, no localStorage, no fingerprint, no person profile. It sends page views and contact clicks to PostHog (EU).
 * It does nothing on any other host (so self-hosted copies send nothing), nothing inside an embedding frame,
 * and nothing when Do Not Track or Global Privacy Control is on. */
(function () {
  'use strict';
  var HOST = 'ua5er.github.io';
  var SITE = 'dc-lite-demo';
  var KEY = 'phc_CG97e9YEXGXENgp3za52XwctotC7ffY5W42dTeK62UUw'; // public project key
  var ENDPOINT = 'https://eu.i.posthog.com/i/v0/e/';
  var nav = navigator;
  if (location.hostname !== HOST) return;
  if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return;
  try { if (window.top !== window.self) return; } catch (e) { return; } // embedded concept frames are not page views

  var file = location.pathname.split('/').pop().replace(/\.html$/, '');
  var page = file || 'home';

  function send(event, props) {
    try {
      var p = { $process_person_profile: false, $lib: 'pages-analytics', site: SITE, page: page, $current_url: location.origin + location.pathname, $pathname: location.pathname };
      for (var k in props) p[k] = props[k];
      var body = JSON.stringify({ api_key: KEY, event: event, distinct_id: 'anon', properties: p });
      if (nav.sendBeacon && nav.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) { /* analytics must never break the page */ }
  }

  send('$pageview', { path: location.pathname });

  function channel(a) {
    var h; try { h = new URL(a.href, location.href); } catch (e) { return null; }
    var host = h.hostname.replace(/^www\./, ''), path = h.pathname.replace(/\/+$/, '');
    if (host === 'roimobi.com') return path === '/tg' ? 'telegram' : 'site';
    if (host === 't.me' && path === '/ua5er') return 'telegram';
    if (host === 'linkedin.com' && path.indexOf('/in/vlad-yasinski') === 0) return 'linkedin';
    if (host === 'github.com' && path === '/ua5er') return 'github';
    return null;
  }
  function placement(a) {
    if (a.closest('footer')) return 'footer';
    if (a.closest('header, nav')) return 'header';
    if (a.closest('.links, .btn, .cta')) return 'cta';
    return 'readme-link-on-page';
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var ch = channel(a);
    if (ch) send('contact_click', { channel: ch, placement: placement(a) });
  }, true);
})();
