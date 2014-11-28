/*jslint node:true, bitwise:true */
var Q = require('q');
var http = require('http');
var chalk = require('chalk');
var es = require('event-stream');
var BunzipStream = require('./bunzipstream');
var lookup = require('./lookup');

// Take AS->Country web page and translate it to a JS lookup map.
var parseAS2CountryMap = function (page) {
  'use strict';
  var regex = /AS(\d*)[\s\S]*,([A-Z]{2})/m,
    lines = page.split('<a href'),
    line,
    db = {},
    i;
  console.log(chalk.blue("Parsing ASN -> Country Map"));

  for (i = 0; i < lines.length; i += 1) {
    line = regex.exec(lines[i]);
    if (line && line[2] !== 'ZZ') {
      db[line[1]] = line[2];
    }
  }
  console.log(chalk.green("Done."));
  return db;
};

// Create AS 2 Country Mapping.
var createAS2CountryMap = function () {
  'use strict';
  var url = "http://www.cidr-report.org/as2.0/autnums.html";
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

// Take a line of the origin AS file and load it into a hash map.
// Map format is {start -> {cidr -> asn}}
var parseASLineRegex = /IN TXT\s+"(\d+)" "(\d+\.\d+\.\d+\.\d+)" "(\d+)"/;
var parseASLine = function (map, line) {
  'use strict';
  var result = parseASLineRegex.exec(line),
    start,
    cidr;
  if (result) {
    start = new Buffer(result[2].split('.')).readInt32BE(0);
    cidr = parseInt(result[3], 10);
    if (!map[start]) {
      map[start] = {};
    }
    if (!map[start][cidr]) {
      map[start][cidr] = parseInt(result[1], 10);
    }
  }
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
    var map = {};

    http.get(url, function (res) {
      res.pipe(new BunzipStream())
        .pipe(es.split())
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
  });
};

// Merge IP->Country map from IP->ASN and ASN->Country maps.
var mergeIP2CountryMap = function (ip2as, as2country) {
  'use strict';
  var prefix,
    cidr,
    announcements = 0,
    notfound = 0;
  console.log(chalk.blue("Merging ASN and Country Maps"));

  for (prefix in ip2as) {
    if (ip2as.hasOwnProperty(prefix)) {
      for (cidr in ip2as[prefix]) {
        if (ip2as[prefix].hasOwnProperty(cidr)) {
          announcements += 1;
          ip2as[prefix][cidr] = as2country[ip2as[prefix][cidr]] || (++notfound && 'ZZ');
        }
      }
    }
  }
  // Get a 3decimal precision percentage of how many were okay.
  announcements = Math.floor((announcements - notfound) / announcements * 1000) / 10;
  console.log(chalk.green("Done. " + announcements + "% of announcments are geolocated."));
  return ip2as;
};

// Merge redundant entries within the IP-Country mapping.
var dedupeIP2CountryMap = function (countryMap) {
  'use strict';
  var output = {},
    prefix,
    cidr,
    killed = 0,
    wouldBe,
    sibling;
  console.log(chalk.blue("Compressing Map"));

  wouldBe = function (prefix, cidr) {
    return lookup.lookup(countryMap, lookup.prefix(prefix, cidr - 1));
  };
  sibling = function (prefix, cidr) {
    return lookup.lookup(countryMap, prefix ^ (1 << (32 - cidr)));
  };

  for (prefix in countryMap) {
    if (countryMap.hasOwnProperty(prefix)) {
      for (cidr in countryMap[prefix]) {
        if (countryMap[prefix].hasOwnProperty(cidr)) {
          // If this is the same as the implicit value.
          if (wouldBe(prefix, cidr) === countryMap[prefix][cidr]) {
            killed += 1;
          } else {
            if (!output[prefix]) {
              output[prefix] = {};
            }
            output[prefix][cidr] = countryMap[prefix][cidr];
          }
        }
      }
    }
  }

  console.log(chalk.green("Done. Removed " + killed + " (%) unneded entries."));
  return output;
};

// Do all the things.
var getMap = function () {
  'use strict';
  return createAS2CountryMap().then(function (a2cm) {
    return createIP2ASMap().then(function (i2am) {
      var i2cm = mergeIP2CountryMap(i2am, a2cm);
      return dedupeIP2CountryMap(i2cm);
    });
  });
};

exports.createIP2ASMap = createIP2ASMap;
exports.createAS2CountryMap = createAS2CountryMap;
exports.mergeIP2CountryMap = mergeIP2CountryMap;
exports.dedupeIP2CountryMap = dedupeIP2CountryMap;
exports.getMap = getMap;
