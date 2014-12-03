/*jslint node:true, bitwise:true */
var Q = require('q');
var fs = require('fs');
var http = require('http');
var chalk = require('chalk');
var es = require('event-stream');
var spawn = require('child_process').spawn;
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

var parseIP2ASMap = function () {
  'use strict';
  var map = {},
    file = fs.createReadStream('originas');
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

// Merge IP->Country map from IP->ASN and ASN->Country maps.
var mergeIP2CountryMap = function (ip2as, as2country) {
  'use strict';
  var
    keys = Object.keys(ip2as),
    len = keys.length,
    i,
    prefix,
    cidr,
    notfound = 0;
  console.log(chalk.blue("Merging ASN and Country Maps"));

  for (i = 0; i < len; i += 1) {
    ip2as[keys[i]] = as2country[ip2as[keys[i]]] || (++notfound && 'ZZ');
  }
  // Get a 3decimal precision percentage of how many were okay.
  len = Math.floor((len - notfound) / len * 1000) / 10;
  console.log(chalk.green("Done. " + len + "% of announcments are geolocated."));
  return ip2as;
};

// Find sibling pairs.
// In practice this seems to remove 50% of entries.
var reduceIP2CountryMap = function (map, pass) {
  'use strict';
  var keys = Object.keys(map),
    outMap = {},
    withSameSib = 0,
    i,
    parts,
    prefix,
    cidr,
    sibling;
  if (!pass) {
    pass = 1;
  }
  console.log(chalk.blue("Cleaning up Map. Pass #" + pass));
  
  for (i = 0; i < keys.length; i += 1) {
    parts = keys[i].split('/');
    prefix = parseInt(parts[0], 10);
    cidr = parseInt(parts[1], 10);
    sibling = prefix ^ (1 << (32 - cidr));
    if (map[sibling + '/' + cidr] === map[keys[i]]) {
      withSameSib += 1;
      outMap[lookup.prefix(prefix, cidr - 1) + '/' + (cidr - 1)] = map[keys[i]];
    } else {
      outMap[keys[i]] = map[keys[i]];
    }
  }

  console.log(chalk.green("Done. Collapsed " + withSameSib + " entries."));
  if (withSameSib > 0) {
    return reduceIP2CountryMap(outMap, pass + 1);
  } else {
    return outMap;
  }
};

// Remove entries which share the same value as what would be found by going
// up to their parent anyway.
var dedupeIP2CountryMap = function (map) {
  'use strict';
  var keys = Object.keys(map),
    outMap = {},
    dups = 0,
    i,
    parts,
    prefix,
    cidr,
    isDup = false;
  console.log(chalk.blue("Pruning Map."));
  
  for (i = 0; i < keys.length; i += 1) {
    parts = keys[i].split('/');
    prefix = parseInt(parts[0], 10);
    cidr = parseInt(parts[1], 10);
    isDup = false;
    while (cidr > 0) {
      cidr -= 1;
      prefix = lookup.prefix(prefix, cidr);
      if (map[prefix + '/' + cidr] && map[prefix + '/' + cidr] === map[keys[i]]) {
        isDup = true;
        dups += 1;
      } else if (map[prefix + '/' + cidr]) {
        break;
      }
    }
    if (!isDup) {
      outMap[keys[i]] = map[keys[i]];
    }
  }

  console.log(chalk.green("Done. Pruned " + dups + " entries."));
  return outMap;
};

// Build the prefix tree of the map, to perform more advanced rearrangement.
var treeTransform = function (map) {
  'use strict';
  var util = require('./util'),
    tree,
    transform,
    output;
  console.log(chalk.blue("Building Tree."));
  tree = util.tableToTree(map);
  console.log(chalk.blue("Merging Nodes."));
  transform = util.safeMerge(tree, 'ZZ');
  console.log(chalk.green("Done - merged " + transform + " keys."));
  console.log(chalk.blue("Compacting."));
  transform = util.findRearrangements(tree);
  console.log(chalk.blue("Flattening."));
  output = util.treeToTable(transform);
  console.log(chalk.green("Done."));
  return output;
};

// Promise for the final Map
var getMap = function () {
  'use strict';
  var countryMap;
  return createAS2CountryMap().then(function (a2cm) {
    countryMap = a2cm;
    return loadIP2ASMap();
  }).then(function () {
    return parseIP2ASMap().then(function (i2am) {
      return mergeIP2CountryMap(i2am, countryMap);
    }).then(function (map) {
      return reduceIP2CountryMap(map);
    }).then(function (map) {
      return dedupeIP2CountryMap(map);
    }).then(function (map) {
    // Uncomment the following 3 lines to save the pre-image.
    //  var output = require('fs').createWriteStream('ip2country-pretree.js');
    //  return exports.buildOutput(map, output).then(function () { return map; });
    //}).then(function (map) {
      return treeTransform(map);
    });
  });
};

// Creation of ip2country.js
var buildOutput = function (map, outputStream) {
  'use strict';
  return Q.Promise(function (resolve, reject) {
    outputStream.write('var table = ');
    outputStream.write(JSON.stringify(map));
    outputStream.write(';\n');
    outputStream.write(fs.readFileSync(require.resolve('./lookup')));
    outputStream.end(resolve);
  });
};

exports.loadIP2ASMap = loadIP2ASMap;
exports.parseIP2ASMap = parseIP2ASMap;
exports.createAS2CountryMap = createAS2CountryMap;
exports.mergeIP2CountryMap = mergeIP2CountryMap;
exports.reduceIP2CountryMap = reduceIP2CountryMap;
exports.dedupeIP2CountryMap = dedupeIP2CountryMap;
exports.getMap = getMap;
exports.buildOutput = buildOutput;
