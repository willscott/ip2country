/*jslint node:true */
import fs from 'node:fs';
import chalk from 'chalk';

// Attempt to load a compiled maping from cache.
export function checkCache(filename, ttl) {
  if (filename.startsWith('file://')) {
    filename = filename.slice(7);
  }
  if (!fs.existsSync(filename)) {
    console.log(chalk.yellow("Cache file not found: " + filename));
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
