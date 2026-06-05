var http = require('http');
var fs = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '..');

var contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript'
};

function send(res, status, contentType, body) {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

http.createServer(function (req, res) {
  var urlPath = req.url.split('?')[0];
  var requestedPath = urlPath === '/' ? '/index.html' : urlPath;
  var filePath = path.resolve(root, '.' + decodeURIComponent(requestedPath));

  console.log(`${new Date().toISOString()} ${req.method} ${urlPath} -> ${filePath}`);

  if (filePath !== root && filePath.indexOf(root + path.sep) !== 0) {
    console.log('Forbidden access attempt:', filePath);
    send(res, 403, 'text/plain', 'Forbidden');
    return;
  }

  fs.readFile(filePath, function (error, contents) {
    if (error) {
      console.log(`404 Not found: ${filePath}`);
      send(res, 404, 'text/plain', 'Not found');
      return;
    }

    send(
      res,
      200,
      contentTypes[path.extname(filePath)] || 'application/octet-stream',
      contents
    );
  });
}).listen(process.env.PORT || 8000, () => {
  console.log(`Static server running on port ${process.env.PORT || 8000}`);
});
