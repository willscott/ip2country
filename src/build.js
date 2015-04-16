/*jslint node:true, bitwise:true */
var Q = require('q');
var fs = require('fs');
var http = require('http');
var chalk = require('chalk');
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
    /*jslint newcap:true*/
    return Q(outMap);
    /*jslint newcap:false*/
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
  var treeBuilder = require('./tree'),
    tree,
    transform,
    output;
  console.log(chalk.blue("Building Tree."));
  tree = treeBuilder.tableToTree(map);
  console.log(chalk.blue("Merging Nodes."));
  transform = treeBuilder.safeMerge(tree, 'ZZ');
  console.log(chalk.green("Done - merged " + transform + " keys."));
  console.log(chalk.blue("Compacting."));
  transform = treeBuilder.findRearrangements(tree);
  console.log(chalk.blue("Flattening."));
  output = treeBuilder.treeToTable(tree);
  console.log(chalk.green("Done."));
  return output;
};

// Generic map maker with options exposed.
var getGenericMap = function (compress, toCountry, when, nocache) {
  'use strict';
  var countryMap,
    asmapper;
  if (when) {
    asmapper = require('./historicBGPData');
  } else {
    asmapper = require('./currentBGPData');
  }

  return asmapper.loadIP2ASMap(when, nocache).then(function (path) {
    return asmapper.parseIP2ASMap(path);
  }).then(function (i2am) {
    asmapper.cleanup(nocache);
    if (toCountry) {
      return createAS2CountryMap().then(function (a2cm) {
        return mergeIP2CountryMap(i2am, a2cm);
      });
    } else {
      return i2am;
    }
  }).then(function (map) {
    if (compress) {
      return reduceIP2CountryMap(map)
        .then(function (map) {
          return dedupeIP2CountryMap(map);
        }).then(function (map) {
          return treeTransform(map);
        });
    } else {
      return map;
    }
  });
};

// Promise for the final Map
var getMap = function () {
  'use strict';
  return getGenericMap(true, true);
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

exports.createAS2CountryMap = createAS2CountryMap;
exports.mergeIP2CountryMap = mergeIP2CountryMap;
exports.reduceIP2CountryMap = reduceIP2CountryMap;
exports.dedupeIP2CountryMap = dedupeIP2CountryMap;
exports.getMap = getMap;
exports.getGenericMap = getGenericMap;
exports.buildOutput = buildOutput;
