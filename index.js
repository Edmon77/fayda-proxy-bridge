const http = require('http');
const httpProxy = require('http-proxy');
const { execSync } = require('child_process');
const proxy = httpProxy.createProxyServer({});

// --- SECURITY ---
const AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || 'fayda-secret-bridge-2026';

const server = http.createServer((req, res) => {
  // 1. Health check
  if (req.url === '/ping') {
    res.writeHead(200);
    return res.end('pong');
  }

  // 2. Diagnostic endpoint: Test Fayda via Bridge Native Curl
  if (req.url === '/test-reach') {
    try {
      const result = execSync('curl -s -v https://api-resident.fayda.et/validateOtp --max-time 10', { encoding: 'utf-8' });
      res.writeHead(200);
      return res.end(`CURL SUCCESS: ${result.substring(0, 100)}`);
    } catch (e) {
      res.writeHead(500);
      return res.end(`CURL FAILED: ${e.message}\nSTDOUT: ${e.stdout}\nSTDERR: ${e.stderr}`);
    }
  }

  // 3. Auth Check
  if (req.headers['x-proxy-auth'] !== AUTH_TOKEN) {
    res.writeHead(401);
    return res.end('Unauthorized');
  }

  const targetHost = req.headers['x-target-host'];
  if (!targetHost) {
    res.writeHead(400);
    return res.end('Missing x-target-host header');
  }

  console.log(`Proxying: ${targetHost}${req.url}`);

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
server.listen(PORT, () => console.log(`Diagnostic Proxy Bridge active on port ${PORT}`));
