/*jslint node:true */
import fs from 'node:fs';
import chalk from 'chalk';
import {checkCache} from './cache.js';

// invert the map
export function parseAS2CountryMap(asbycountry) {
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

export async function getAS2CountryCache(cb) {
  let filename = import.meta.resolve('asbycountry/asbycountry.json');
  if (checkCache(filename, 1000 * 60 * 60 * 24)) {
    console.log(chalk.blue("Country -> ASN Map Usable."));
    let abc = await import('asbycountry/asbycountry.json', { with: { "type": "json" }});
    return abc.default
  } else {
    console.log(chalk.yellow("Triggering Rebuild of Country -> ASN Map."));
    let abc = await import('asbycountry/rebuild.js')
    return abc;
  }
};

// Create AS 2 Country Mapping.
export default async function createAS2CountryMap(nocache) {
  console.log(chalk.blue("Loading ASN -> Country Map"));

  let asbycountry = await getAS2CountryCache()
  return parseAS2CountryMap(asbycountry)
};
