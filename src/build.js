var Q = require('q');
var http = require('http');
var chalk = require('chalk');

// Create AS 2 Country Mapping.
var createAS2CountryMap = function () {
  'use strict';
  var url = "http://www.cidr-report.org/as2.0/bgp-originas.html";
  console.log(chalk.blue("Loading ASN -> Country Map"));

  return Q.Promise(function (resolve, reject) {
    var data = '';

    http.get(url, function (res) {
      res.on('data', function (chunk) {
        data += chunk.toString();
      });

      res.on('end', function () {
        console.log(chalk.green("Done."));
        data = parseAS2CountryMap(data);
        resolve(data);
        data = '';
      });

      res.on('error', function (err) {
        console.warn(chalk.red("ASN -> Country Map failed:" + err));
        reject(err);
      });
    });
  });
};

// Take AS->Country web page and translate it to a JS lookup map.
var parseAS2CountryMap = function (page) {
  'use strict';
  var regex = /\d+.*AS(\d+).*,([A-Z]{2})/,
    lines = page.split('\n'),
    line,
    db = {},
    i;
  console.log(chalk.blue("Parsing ASN -> Country Map"));

  for (i = 0; i < lines.length; i += 1) {
    line = regex.exec(lines[i]);
    if (line) {
      db[line[1]] = line[2];
    }
  }
  console.log(chalk.green("Done."));
  return db;
};

// Create IP 2 AS Mapping.
var createIP2ASMap = function () {
  'use strict';
  var url = "http://archive.routeviews.org/dnszones/originas.bz2";
  // Note: routeviews will provide an IPv6 address, but the web server
  // doesn't listen on it appropriately. If your machine is ipv6 enabled
  // you will need to force an IPv4 connection by changing the above url
  // to "http://128.223.51.20/dnszones/originas.bz2".
  console.log(chalk.blue("Loading IP -> ASN Map"));

  return Q.Promise(function (resolve, reject) {
    var data = '';

    http.get(url, function (res) {
      res.on('data', function (chunk) {
        data += chunk.toString();
      });

      res.on('end', function () {
        console.log(chalk.green("Done."));
        data = parseAS2CountryMap(data);
        resolve(data);
        data = '';
      });

      res.on('error', function (err) {
        console.warn(chalk.red("ASN -> Country Map failed:" + err));
        reject(err);
      });
    });
  });
};

// Build the in memory representation of the origin ip->asn mapping.
// Returns promise with that map.
function makeASMap() {
  console.log(chalk.blue("Building ASN Mapping"));
  var map = {};
  map.lookup = doASLookup;
  return Q.Promise(function(resolve, reject) {
    fs.createReadStream("originas", {flags: 'r'})
      .pipe(es.split())  //split on new lines
      .pipe(es.mapSync(parseASLine.bind({}, map)))
      .on('end', function() {resolve(map);})
      .on('error', function(err) { reject('Error Building ASN Mapping' + err); });
  });
}

// actually: http://archive.routeviews.org/dnszones/originas.bz2
// but domain defaults to broken ipv6 resolution.
var as_file = "http://128.223.51.20/dnszones/originas.bz2";
if (!fs.existsSync('originas.bz2') ||
    new Date() - fs.statSync('originas.bz2').mtime > (1000 * 60 * 60 * 24 * 30)) {
  console.log(chalk.blue("Refreshing OriginAS List"));
  exec("curl -O " + as_file, puts);
  exec("bunzip2 originas.bz2", puts);
}

// Take a line of the origin AS file and load it into a hash map.
// Map format is {start -> {cidr -> asn}}
var parseASLineRegex = /IN TXT\s+"(\d+)" "(\d+\.\d+\.\d+\.\d+)" "(\d+)"/;
function parseASLine(map, line) {
  var result = parseASLineRegex.exec(line),
      start;
  if (result) {
    start = new Buffer(result[2].split('.')).readInt32BE(0);
    start -= start % 256  // make sure it's class C.
    if (!map[start]) {
      map[start] = {};
    }
    map[start][parseInt(result[3])] = parseInt(result[1]);
  }
};