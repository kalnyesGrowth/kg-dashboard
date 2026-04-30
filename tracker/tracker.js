/**
 * KG Tracker — embed on every client site
 * Usage: <script src="https://yourdomain.com/tracker/tracker.js" data-client="CLIENT_ID"></script>
 *
 * Events captured automatically: pageview, session_start
 * Manual helpers: KGTrack.lead(), KGTrack.email(email, source), KGTrack.addToCart(value), KGTrack.order(id, value)
 */
(function () {
  'use strict';

  var script  = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var CLIENT_ID = script.getAttribute('data-client');
  // v2: point this at your Supabase edge function or REST endpoint
  var ENDPOINT  = 'https://boddsbxlaytcrkpuckyn.supabase.co/rest/v1/events';
  var API_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvZGRzYnhsYXl0Y3JrcHVja3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MTY1MjMsImV4cCI6MjA5MzA5MjUyM30.0pz_P4IMtlE6b7edZa-G82P9-PyNYecm1uMbhZiURYo';

  if (!CLIENT_ID) { console.warn('[KGTracker] Missing data-client attribute.'); return; }

  // ── Session management ────────────────────────────────────────
  var SESSION_KEY = 'kg_sid_' + CLIENT_ID;
  var SESSION_TTL = 30 * 60 * 1000; // 30 min inactivity

  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (Date.now() - s.last > SESSION_TTL) { sessionStorage.removeItem(SESSION_KEY); return null; }
      return s;
    } catch (e) { return null; }
  }

  function touchSession() {
    var s = getSession() || { id: uuid(), started: Date.now() };
    s.last = Date.now();
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Send event ────────────────────────────────────────────────
  function send(type, payload) {
    var session = touchSession();
    var body = JSON.stringify({
      client_id:  CLIENT_ID,
      session_id: session.id,
      event_type: type,
      page:       location.pathname,
      referrer:   document.referrer || null,
      ua:         navigator.userAgent,
      ts:         new Date().toISOString(),
      payload:    payload || null,
    });

    // Use sendBeacon when available (works on page unload too)
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT + '?apikey=' + API_KEY, blob);
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
        body: body,
        keepalive: true,
      }).catch(function () {});
    }
  }

  // ── Auto events ───────────────────────────────────────────────
  var existing = getSession();
  if (!existing) {
    send('session_start', null);
  }
  send('pageview', null);

  // ── Public API ─────────────────────────────────────────────────
  window.KGTrack = {
    /** Call when a lead form is submitted */
    lead: function (formId) {
      send('lead', { form: formId || 'unknown' });
    },
    /** Call when an email is captured */
    email: function (email, source) {
      send('email_capture', { email: email, source: source || 'unknown' });
    },
    /** Call when a product is added to cart */
    addToCart: function (value) {
      send('add_to_cart', { value: value || 0 });
    },
    /** Call on order/purchase confirmation */
    order: function (orderId, value) {
      send('order', { order_id: orderId, value: value || 0 });
    },
  };

})();
