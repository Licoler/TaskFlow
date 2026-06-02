// Zero Dependencies Node.js HTTP Server for running static on localhost
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

  if (filePath !== root && filePath.indexOf(root + path.sep) !== 0) {
    send(res, 403, 'text/plain', 'Forbidden');
    return;
  }

  fs.readFile(filePath, function (error, contents) {
    if (error) {
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
}).listen(process.env.PORT || 8000);
