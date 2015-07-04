/*jslint node:true */
var fs = require('fs');
var chalk = require('chalk');

// Attempt to load a compiled maping from cache.
var checkCache = function (filename, ttl) {
  if (!fs.existsSync(filename)) {
    return false;
  }
  var mtime = fs.statSync(filename).mtime;
  // cache for 1 day.
  if (new Date().getTime() - mtime.getTime() > ttl) {
    fs.unlinkSync(filename);
    return false;
  }
  return true;
};

exports.has = checkCache;
