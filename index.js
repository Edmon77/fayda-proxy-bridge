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

  console.log(`[Proxy] Relaying: ${targetHost}${req.url}`);

  const curlArgs = [
    '-X', req.method,
    '-s', '-i', // Include headers in output
    '-L',      // Follow redirects
    '--max-time', '60',
    `https://${targetHost}${req.url}`
  ];

  // Forward all allowed headers
  const blockedHeaders = ['host', 'connection', 'content-length', 'x-proxy-auth', 'x-target-host'];
  Object.keys(req.headers).forEach(h => {
    if (!blockedHeaders.includes(h.toLowerCase())) {
      curlArgs.push('-H', `${h}: ${req.headers[h]}`);
    }
  });

  // Specifically set Host header to target
  curlArgs.push('-H', `Host: ${targetHost}`);

  // Handle body for POST/PUT
  if (req.method === 'POST' || req.method === 'PUT') {
    curlArgs.push('--data-binary', '@-');
  }

  const { spawn } = require('child_process');
  const curl = spawn('curl', curlArgs);

  // Pipe request body to curl if needed
  if (req.method === 'POST' || req.method === 'PUT') {
    req.pipe(curl.stdin);
  }

  // Parse curl output (headers + body)
  let headerOutput = '';
  let bodyStarted = false;

  curl.stdout.on('data', (chunk) => {
    if (bodyStarted) {
      res.write(chunk);
    } else {
      headerOutput += chunk.toString();
      const headerEndIndex = headerOutput.indexOf('\r\n\r\n');
      if (headerEndIndex !== -1) {
        bodyStarted = true;
        const rawHeaders = headerOutput.substring(0, headerEndIndex).split('\r\n');
        const bodyPart = headerOutput.substring(headerEndIndex + 4);
        
        // Finalize headers for res
        const firstLine = rawHeaders[0]; // e.g., HTTP/1.1 200 OK
        const statusCode = parseInt(firstLine.split(' ')[1]) || 200;
        
        const resHeaders = {};
        for(let i=1; i<rawHeaders.length; i++) {
          const [key, ...val] = rawHeaders[i].split(': ');
          if (key && !['transfer-encoding', 'content-encoding', 'connection'].includes(key.toLowerCase())) {
            resHeaders[key] = val.join(': ');
          }
        }
        
        res.writeHead(statusCode, resHeaders);
        if (bodyPart.length > 0) {
          res.write(Buffer.from(bodyPart));
        }
      }
    }
  });

  curl.stdout.on('end', () => res.end());
  curl.on('error', (err) => {
    console.error('Proxy Bridge Error:', err);
    res.writeHead(500);
    res.end('Proxy Bridge Error');
  });
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy Error:', err);
  res.writeHead(500);
  res.end('Proxy Error');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Diagnostic Proxy Bridge active on port ${PORT}`));
