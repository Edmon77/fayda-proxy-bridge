const http = require('http');
const httpProxy = require('http-proxy');
const proxy = httpProxy.createProxyServer({});

// --- SECURITY ---
// Set this in Render's Environment Variables as PROXY_AUTH_TOKEN
const AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || 'fayda-secret-bridge-2026';

const server = http.createServer((req, res) => {
  // 1. Keep-alive / Health check endpoint
  if (req.url === '/ping') {
    res.writeHead(200);
    return res.end('pong');
  }

  // 2. Auth Check
  if (req.headers['x-proxy-auth'] !== AUTH_TOKEN) {
    console.log('Unauthorized request attempt');
    res.writeHead(401);
    return res.end('Unauthorized');
  }

  // 3. Routing Logic
  // The bot will send 'x-target-host' (e.g., api-resident.fayda.et)
  const targetHost = req.headers['x-target-host'];
  if (!targetHost) {
    res.writeHead(400);
    return res.end('Missing x-target-host header');
  }

  console.log(`Proxying request to: ${targetHost}${req.url}`);

  proxy.web(req, res, { 
    target: `https://${targetHost}`,
    changeOrigin: true
  });
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy Error:', err);
  res.writeHead(500);
  res.end('Proxy Error');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Proxy Bridge active on port ${PORT}`));
