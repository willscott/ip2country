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
var offsets = [0, 0],
  parseASLine,
  asnRegex = /(\d+) [ie]$/;

var parseRIBLine = function (map, line) {
  'use strict';
  var networkEnd = line.indexOf(" ", offsets[0]),
    network,
    asn;
  if (networkEnd < 0) {
    return;
  }
  network = line.substring(offsets[0], networkEnd);
  if (map[network]) {
    return;
  }

  asn = asnRegex.exec(line.substr(offsets[1]));
  if (asn) {
    map[network] = parseInt(asn[1], 10);
  }
};

var parseRIBHeader = function (map, line) {
  'use strict';
  var net = line.indexOf("Network"),
    path = line.indexOf("Path");
  if (net > 0 && path > 0) {
    offsets = [net, path];
    console.log(chalk.blue("Header parameters learned: " + net + ", " + path));
  }
};
parseASLine = function (m, l) {
  'use strict';
  if (offsets[0] === 0) {
    parseRIBHeader(m, l);
  } else {
    parseRIBLine(m, l);
  }
};

// Download IP 2 AS Mapping.
var loadIP2ASMap = function (when) {
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
  var map = {};
  console.log(chalk.blue("Parsing IP -> ASN Map"));

  return Q.promise(function (resolve, reject) {
    var rl = readline(path);
    rl.on('line', parseASLine.bind({}, map))
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

