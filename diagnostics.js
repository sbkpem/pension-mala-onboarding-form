/* Silent upload diagnostics - never blocks or changes the form */
(function () {
  var ENDPOINT = 'https://pension-flow-79c43c9f.base44.app/api/apps/684b22e06236d9fe79c43c9f/functions/onboardingDiagnostics';
  var token = '';
  try { token = new URLSearchParams(window.location.search).get('invitation') || ''; } catch (e) {}
  function uuid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function now() { try { return performance.now(); } catch (e) { return Date.now(); } }
  var sessionId = uuid(), traceId = sessionId, startedAt = now(), file = null, failedLogged = false, lastCsp = '';
  try {
    document.addEventListener('securitypolicyviolation', function (e) {
      var host = ''; try { host = new URL(e.blockedURI).host; } catch (x) { host = String(e.blockedURI || '').slice(0, 40); }
      lastCsp = (e.violatedDirective || 'csp') + ' ' + host;
    });
  } catch (e) {}
  function env() {
    var c = navigator.connection || {};
    return { online: typeof navigator.onLine === 'boolean' ? navigator.onLine : undefined, connection_type: c.effectiveType || c.type || undefined };
  }
  function send(payload) {
    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) {}
  }
  function log(event, data) {
    try {
      var p = { trace_id: traceId, session_id: sessionId, event: event, invitation: token,
        client_time: new Date().toISOString(), user_agent: navigator.userAgent,
        duration_ms: Math.round(now() - startedAt) };
      var e = env(); p.online = e.online; p.connection_type = e.connection_type;
      if (lastCsp) p.csp_violation = lastCsp;
      if (file) { p.file_type = file.type || 'unknown'; p.file_size = file.size; }
      data = data || {};
      for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) p[k] = data[k];
      if (p.outcome === 'failure') failedLogged = true;
      setTimeout(function () { send(p); }, 0);
    } catch (e) {}
  }
  function category(status, parsed) {
    if (status === null || status === undefined) return 'network_error';
    if (!parsed) return 'invalid_response';
    if (status === 403) return 'invitation_rejected';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server_error';
    if (status >= 400) return 'server_validation';
    return 'no_file_url';
  }
  function probe(target, url, opts) {
    var t0 = now(), ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    if (ctrl) opts.signal = ctrl.signal;
    opts.cache = 'no-store';
    return fetch(url, opts).then(function (res) {
      var ok = res.type === 'opaque' || res.ok;
      return { target: target, result: ok ? 'ok' : 'http_error', http_status: res.status || undefined };
    }, function (err) {
      return { target: target, result: err && err.name === 'AbortError' ? 'timeout' : 'network_error' };
    }).then(function (r) { clearTimeout(timer); r.duration_ms = Math.round(now() - t0); return r; });
  }
  function runChecks() {
    try {
      var self = window.location.href.split('#')[0];
      Promise.all([
        probe('app_cors', ENDPOINT + '?probe=cors', { method: 'GET' }),
        probe('app_opaque', ENDPOINT + '?probe=basic', { method: 'GET', mode: 'no-cors' }),
        probe('form_origin', self, { method: 'HEAD' })
      ]).then(function (results) {
        log('connectivity_check', { outcome: 'info', probe_results: results });
      }).catch(function () {});
    } catch (e) {}
  }
  window.pfDiag = {
    start: function (f) {
      try { traceId = uuid(); startedAt = now(); file = f || null; failedLogged = false; log('file_selected', { outcome: 'info' }); } catch (e) {}
    },
    log: log,
    failed: function (status, parsed, message, name) {
      try {
        if (failedLogged) return;
        log('upload_failed', { outcome: 'failure', error_category: category(status, parsed),
          http_status: status, error_message: String(message || '').slice(0, 300), error_name: name ? String(name).slice(0, 60) : undefined });
        if (status === null || status === undefined || !parsed) setTimeout(runChecks, 300);
      } catch (e) {}
    }
  };
  log('form_opened', { outcome: 'info', has_invitation: !!token });
})();
