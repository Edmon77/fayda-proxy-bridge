const http = require('http');
const https = require('https');

const AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || 'fayda-secret-bridge-2026';

const server = http.createServer((req, res) => {
  // 1. Health check
  if (req.url === '/ping') {
    res.writeHead(200);
    return res.end('pong');
  }

  // 2. Auth Check
  if (req.headers['x-proxy-auth'] !== AUTH_TOKEN) {
    res.writeHead(401);
    return res.end('Unauthorized');
  }

  const targetHost = req.headers['x-target-host'];
  if (!targetHost) {
    res.writeHead(400);
    return res.end('Missing x-target-host header');
  }

  console.log(`[Bridge] Proxying to: ${targetHost}${req.url}`);

  // 3. Prepare Proxy Request
  const proxyReq = https.request({
    hostname: targetHost,
    port: 443,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetHost // Override host header
    }
  }, (proxyRes) => {
    // Forward the response
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Bridge] Request Error:', err);
    res.writeHead(500);
    res.end('Bridge Proxy Error');
  });

  // 4. Pipe the original request body into the proxy request
  req.pipe(proxyReq);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Robust Proxy Bridge active on port ${PORT}`));
