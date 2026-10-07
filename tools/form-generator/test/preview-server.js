/**
 * Serves the form-generator folder and injects the Apps Script mock into Index.html.
 * Usage: node tools/form-generator/test/preview-server.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Number(process.argv[2] || 8765);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.gs': 'text/plain; charset=utf-8'
};

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const rel = pathname.replace(/^\/+/, '');
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    if (path.basename(file) === 'Index.html') {
      data = Buffer.from(String(data).replace('<head>', '<head><script src="/test/mock-gas.js"></script>'));
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', function () {
  console.log('preview http://127.0.0.1:' + port + '/Index.html');
});
