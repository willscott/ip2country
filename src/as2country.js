/*jslint node:true */
var Q = require('q');
var fs = require('fs');
var http = require('http');
var chalk = require('chalk');

var cache = require('./cache');

// invert the map
var parseAS2CountryMap = function (asbycountry) {
  'use strict';
  console.log(chalk.blue("Parsing ASN <-> Country Map"));

  var db = {};
  Object.keys(asbycountry).forEach(function (country) {
    asbycountry[country].forEach(function (as) {
      db[as] = country;
    });
  });

  console.log(chalk.green("Done."));
  return db;
};

var getAS2CountryCache = function (cb) {
  var filename = require.resolve('asbycountry/asbycountry.json');
  if (cache.has(filename, 1000 * 60 * 60 * 24)) {
    console.log(chalk.blue("Country -> ASN Map Usable."));
    cb(require('asbycountry'));
  } else {
    console.log(chalk.yellow("Triggering Rebuild of Country -> ASN Map."));
    require('asbycountry/rebuild')(cb);
  }
};

// Create AS 2 Country Mapping.
var createAS2CountryMap = function (nocache) {
  'use strict';
  console.log(chalk.blue("Loading ASN -> Country Map"));

  return Q.Promise(function (resolve, reject) {
    getAS2CountryCache(function (asbycountry) {
      resolve(parseAS2CountryMap(asbycountry));
    });
  });
};

exports.createAS2CountryMap = createAS2CountryMap;
