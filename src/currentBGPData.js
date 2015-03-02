/*jslint node:true, bitwise:true */
var Q = require('q');
var fs = require('fs');
var http = require('http');
var chalk = require('chalk');
var es = require('event-stream');
var spawn = require('child_process').spawn;

// Take a line of the origin AS file and load it into a hash map.
// Map format is {start -> {cidr -> asn}}
var parseASLineRegex = /IN TXT\s+"(\d+)" "(\d+\.\d+\.\d+\.\d+)" "(\d+)"/;
var parseASLine = function (map, line) {
  'use strict';
  var result = parseASLineRegex.exec(line),
    start,
    cidr;
  if (result) {
    start = new Buffer(result[2].split('.')).readUInt32BE(0);
    cidr = parseInt(result[3], 10);
    map[start + '/' + cidr] = parseInt(result[1], 10);
  }
};

// Download IP 2 AS Mapping.
var loadIP2ASMap = function () {
  'use strict';
  var url = "http://archive.routeviews.org/dnszones/originas.bz2";
  // Note: routeviews will provide an IPv6 address, but the web server
  // doesn't listen on it appropriately. If your machine is ipv6 enabled
  // you will need to force an IPv4 connection by changing the above url
  // to "http://128.223.51.20/dnszones/originas.bz2".
  console.log(chalk.blue("Downloading IP -> ASN Map"));

  return Q.Promise(function (resolve, reject) {
    var download = fs.createWriteStream('originas.bz2');

    http.get(url, function (res) {
      res.pipe(download);
      res.on('end', function () {
        if (fs.existsSync('originas')) {
          fs.unlinkSync('originas');
        }
        console.log(chalk.blue("Uncompressing..."));
        // Note: We download the file and use the external bunzip2 utility
        // because the node seek-bzip and alternative JS native
        // implementations are orders of magnitude slower, and make this
        // a process which can't actually be done in a sane manner.
        var decompression = spawn('bunzip2', ['originas.bz2']);
        decompression.on('close', function (code) {
          if (code !== 0) {
            console.warn(chalk.red("Decompression failed:" + code));
            reject(code);
          } else {
            console.log(chalk.green("Done."));
            resolve('originas');
          }
        });
      }).on('error', function (err) {
        console.warn(chalk.red("Download Failed:" + err));
        reject(err);
      });
    });
  });
};

var parseIP2ASMap = function (path) {
  'use strict';
  var map = {},
    file = fs.createReadStream(path);
  console.log(chalk.blue("Parsing IP -> ASN Map"));

  return Q.promise(function (resolve, reject) {
    file.pipe(es.split())
      .pipe(es.mapSync(parseASLine.bind({}, map)))
      .on('end', function () {
        console.log(chalk.green("Done."));
        resolve(map);
      })
      .on('error', function (err) {
        console.warn(chalk.red("ASN -> Country Map failed:" + err));
        reject(err);
      });
  });
};

exports.loadIP2ASMap = loadIP2ASMap;
exports.parseIP2ASMap = parseIP2ASMap;

