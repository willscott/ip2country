/*jslint node:true, bitwise:true */
var Q = require('q');
var fs = require('fs');
var http = require('http');
var chalk = require('chalk');
var readline = require('linebyline');
var spawn = require('child_process').spawn;
var moment = require('moment');

// Take a line of the origin RIB file and load it into a hash map.
// Map format is {start -> {cidr -> asn}}
var asnRegex = /(\d+) [ie]$/;

var parseRIBLine = function (offsets, seen, map, line) {
  'use strict';
  var networkSlash = line.indexOf("/", offsets[0]),
    networkEnd = line.indexOf(" ", networkSlash),
    network,
    asn;
  if (networkEnd < 0) {
    return;
  }
  network = line.substring(offsets[0], networkEnd);
  if (seen[network]) {
    return;
  } else {
    seen[network] = true;
  }
  network = new Buffer(network.substr(0, networkSlash - offsets[0]).split('.')).readUInt32BE(0);

  asn = asnRegex.exec(line.substr(offsets[1]));
  if (asn) {
    map[network + line.substring(networkSlash, networkEnd)] = parseInt(asn[1], 10);
  }
};

var parseRIBHeader = function (offsets, map, line) {
  'use strict';
  var net = line.indexOf("Network"),
    path = line.indexOf("Path");
  if (net > 0 && path > 0) {
    offsets[0] = net;
    offsets[1] = path;
    console.log(chalk.blue("Header parameters learned: " + net + ", " + path));
  }
};

var parseASLine = function (c, s, m, l) {
  'use strict';
  if (c[0] === 0) {
    parseRIBHeader(c, m, l);
  } else {
    parseRIBLine(c, s, m, l);
  }
};

// Download IP 2 AS Mapping.
var loadIP2ASMap = function (when, nocache) {
  'use strict';
  var roundedTime = moment(when).startOf('hour'),
    url;
  roundedTime.hour(roundedTime.hour() - (roundedTime.hour() % 2));
  url = roundedTime.format("[http://archive.routeviews.org/oix-route-views/]YYYY.MM/[oix-full-snapshot-]YYYY-MM-DD-HHmm[.bz2]");

  console.log(chalk.blue(roundedTime.format("[Downloading IP -> ASN Map for] MMM D, YYYY")));

  return Q.Promise(function (resolve, reject) {
    var download = fs.createWriteStream('rib.bz2');

    http.get(url, function (res) {
      res.pipe(download);
      res.on('end', function () {
        if (fs.existsSync('rib')) {
          fs.unlinkSync('rib');
        }
        console.log(chalk.blue("Decompressing..."));
        // Note: We download the file and use the external bunzip2 utility
        // because the node seek-bzip and alternative JS native
        // implementations are orders of magnitude slower, and make this
        // a process which can't actually be done in a sane manner.
        var decompression = spawn('bunzip2', ['rib.bz2']);
        decompression.on('close', function (code) {
          if (code !== 0) {
            console.warn(chalk.red("Decompression failed:" + code));
            reject(code);
          } else {
            console.log(chalk.green("Done."));
            resolve('rib');
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
  var conf = [0, 0], seen = {}, map = {};
  console.log(chalk.blue("Parsing IP -> ASN Map"));

  return Q.promise(function (resolve, reject) {
    var rl = readline(path);
    rl.on('line', parseASLine.bind({}, conf, seen, map))
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

var cleanup = function (nocache) {
  // don't know what day rib is from, so harder to save it.
  if (fs.existsSync('rib')) {
    fs.unlinkSync('rib');
  }
};

exports.loadIP2ASMap = loadIP2ASMap;
exports.parseIP2ASMap = parseIP2ASMap;
exports.cleanup = cleanup;
