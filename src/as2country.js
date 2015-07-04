/*jslint node:true */
var Q = require('q');
var fs = require('fs');
var http = require('http');
var chalk = require('chalk');

var cache = require('./cache');

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

var getAS2CountryCache = function (data) {
  var filename = __dirname + '/.as2country.cache.json';
  if (cache.has(filename, 1000 * 60 * 60 * 24)) {
    console.log(chalk.blue("Loading ASN -> Country Map from Cache"));
    var mapping = JSON.parse(fs.readFileSync(filename));
    return mapping;
  } else {
    return false;
  }
};

var saveAS2CountryCache = function (data) {
  var filename = __dirname + '/.as2country.cache.json';
  fs.writeFileSync(filename, JSON.stringify(data));
};

// Create AS 2 Country Mapping.
var createAS2CountryMap = function (nocache) {
  'use strict';
  var url = "http://www.cidr-report.org/as2.0/autnums.html";
  console.log(chalk.blue("Loading ASN -> Country Map"));

  return Q.Promise(function (resolve, reject) {
    var data = '';
    if (!nocache) {
      data = getAS2CountryCache();
      if (data !== false) {
        return resolve(data);
      }
      data = '';
    }

    http.get(url, function (res) {
      res.on('data', function (chunk) {
        data += chunk.toString();
      });

      res.on('end', function () {
        console.log(chalk.green("Done."));
        data = parseAS2CountryMap(data);
        if (!nocache) {
          saveAS2CountryCache(data);
        }
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

exports.createAS2CountryMap = createAS2CountryMap;
