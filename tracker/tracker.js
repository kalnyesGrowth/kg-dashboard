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
  var ENDPOINT  = 'https://boddsbxlaytcrkpuckyn.supabase.co/functions/v1/track-event';

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
      payload:    payload || null,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // ── Lead capture via edge function ────────────────────────────
  var LEAD_ENDPOINT = 'https://boddsbxlaytcrkpuckyn.supabase.co/functions/v1/capture-lead';

  function extractFormData(form) {
    var data = {};
    var fields = form.querySelectorAll('input, textarea, select');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var hint = (f.name || f.id || f.placeholder || f.type || '').toLowerCase();
      var val  = (f.value || '').trim();
      if (!val || f.type === 'hidden' || f.type === 'submit' || f.type === 'button') continue;
      if (hint.indexOf('name') !== -1 || hint.indexOf('full') !== -1)  data.name  = data.name  || val;
      if (hint.indexOf('email') !== -1 || f.type === 'email')          data.email = data.email || val;
      if (hint.indexOf('phone') !== -1 || hint.indexOf('tel') !== -1 || f.type === 'tel') data.phone = data.phone || val;
      if (hint.indexOf('message') !== -1 || hint.indexOf('comment') !== -1 || hint.indexOf('note') !== -1 || f.tagName === 'TEXTAREA') data.message = data.message || val;
    }
    return data;
  }

  function sendLead(formData) {
    var body = JSON.stringify({
      client_id:  CLIENT_ID,
      name:       formData.name    || null,
      email:      formData.email   || null,
      phone:      formData.phone   || null,
      message:    formData.message || null,
      source_url: location.href,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(LEAD_ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {});
    }
  }

  // Auto-detect form submissions (proper <form> elements)
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var data = extractFormData(form);
    if (data.email || data.phone || data.name) {
      sendLead(data);
      send('lead', { form: form.id || form.name || 'auto' });
    }
  }, true);

  // Auto-detect button clicks on non-form submit buttons
  var _lastLeadTs = 0;
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button, [type="submit"], .form-submit, [class*="submit"], [class*="cta"]');
    if (!btn) return;
    if (btn.closest('form')) return;
    if (Date.now() - _lastLeadTs < 3000) return;
    var container = btn.closest('section, div[class*="form"], div[class*="contact"], div[class*="quote"]') || btn.parentElement?.parentElement;
    if (!container) return;
    var data = extractFormData(container);
    if (data.email || data.phone || data.name) {
      _lastLeadTs = Date.now();
      sendLead(data);
      send('lead', { form: 'button-capture' });
    }
  }, true);

  // ── Public API ─────────────────────────────────────────────────
  window.KGTrack = {
    lead: function (formData) {
      if (typeof formData === 'string') formData = { form: formData };
      if (formData.email || formData.phone || formData.name) {
        sendLead(formData);
      }
      send('lead', { form: formData.form || 'manual' });
    },
    email: function (email, source) {
      send('email_capture', { email: email, source: source || 'unknown' });
    },
    addToCart: function (value) {
      send('add_to_cart', { value: value || 0 });
    },
    order: function (orderId, value) {
      send('order', { order_id: orderId, value: value || 0 });
    },
  };

})();
