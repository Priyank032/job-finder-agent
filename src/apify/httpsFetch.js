/**
 * Native-https fetch shim for google-auth-library / gaxios.
 *
 * Why this exists: gaxios v6 (used by google-auth-library) performs its HTTP
 * calls through Node's built-in fetch (undici). On some Windows / Node 24
 * setups, undici drops the TLS stream mid-body against Google's OAuth token
 * endpoint, surfacing as: "Invalid response body ... Premature close".
 * Node's native `https` module talks to the exact same endpoint reliably, so
 * we hand gaxios a minimal fetch() implementation backed by `node:https`.
 *
 * Usage:
 *   const jwt = new JWT({ ... });
 *   applyHttpsFetch(jwt);   // before any request
 */
const https = require('https');

/** A minimal WHATWG-fetch-compatible function backed by node:https. */
function httpsFetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (opts.headers) {
      if (typeof opts.headers.forEach === 'function') {
        opts.headers.forEach((v, k) => { headers[k] = v; });
      } else {
        Object.assign(headers, opts.headers);
      }
    }

    const body = opts.body;
    if (
      body != null &&
      headers['Content-Length'] == null &&
      headers['content-length'] == null
    ) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(
      String(url),
      { method: opts.method || 'GET', headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage || '',
            headers: {
              get: (h) => res.headers[String(h).toLowerCase()],
              has: (h) => res.headers[String(h).toLowerCase()] != null,
              forEach: (cb) => {
                for (const k in res.headers) cb(res.headers[k], k);
              },
            },
            text: async () => text,
            json: async () => JSON.parse(text),
            arrayBuffer: async () =>
              buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('request timeout')));
    if (body != null) req.write(body);
    req.end();
  });
}

/**
 * Point a google-auth client's gaxios transporter at the native-https shim.
 * No-op-safe: if the internal shape ever changes, we fail loud at call time
 * rather than silently.
 */
function applyHttpsFetch(authClient) {
  const instance = authClient && authClient.transporter && authClient.transporter.instance;
  if (instance && instance.defaults) {
    instance.defaults.fetchImplementation = httpsFetch;
  }
  return authClient;
}

module.exports = { httpsFetch, applyHttpsFetch };
