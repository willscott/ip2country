/*jslint node:true, bitwise:true */
import chalk from 'chalk';
import { prefix as lookupPrefix } from './lookup.js';
import fs from 'node:fs';
import createAS2CountryMap from './as2country.mjs'
import { tableToTree, safeMerge, findRearrangements, treeToTable } from './tree.js';

// Merge IP->Country map from IP->ASN and ASN->Country maps.
export function mergeIP2CountryMap(ip2as, as2country) {
  let
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
export function reduceIP2CountryMap(map, pass) {
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
      outMap[lookupPrefix(prefix, cidr - 1) + '/' + (cidr - 1)] = map[keys[i]];
    } else {
      outMap[keys[i]] = map[keys[i]];
    }
  }

  console.log(chalk.green("Done. Collapsed " + withSameSib + " entries."));
  if (withSameSib > 0) {
    return reduceIP2CountryMap(outMap, pass + 1);
  } else {
    /*jslint newcap:true*/
    return (outMap);
    /*jslint newcap:false*/
  }
};

// Remove entries which share the same value as what would be found by going
// up to their parent anyway.
export function dedupeIP2CountryMap (map) {
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
      prefix = lookupPrefix(prefix, cidr);
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
export function treeTransform(map) {
  let tree,
    transform,
    output;
  console.log(chalk.blue("Building Tree."));
  tree = tableToTree(map);
  console.log(chalk.blue("Merging Nodes."));
  transform = safeMerge(tree, 'ZZ');
  console.log(chalk.green("Done - merged " + transform + " keys."));
  console.log(chalk.blue("Compacting."));
  transform = findRearrangements(tree);
  console.log(chalk.blue("Flattening."));
  output = treeToTable(tree);
  console.log(chalk.green("Done."));
  return output;
};

// Generic map maker with options exposed.
export async function getGenericMap(compress, toCountry, when, nocache) {
  var countryMap,
    asmapper;
  if (when) {
    asmapper = await import('./historicBGPData.js');
  } else {
    asmapper = await import('./currentBGPData.js');
  }

  let path = await asmapper.loadIP2ASMap(when, nocache)
  let i2am = await asmapper.parseIP2ASMap(path);
  asmapper.cleanup(nocache);
  let map
  if (toCountry) {
    let a2cm = await createAS2CountryMap(nocache)
    map = await mergeIP2CountryMap(i2am, a2cm);
  } else {
    map = i2am
  }
  if (compress) {
    map = await reduceIP2CountryMap(map)
    map = await dedupeIP2CountryMap(map);
    map = await treeTransform(map);
  }
  return map
};

// Promise for the final Map
export async function getMap(verbose) {
  return getGenericMap(true, true);
};

// Creation of ip2country.js
export async function buildOutput(map, outputStream) {
  outputStream.write('let table = ');
  outputStream.write(JSON.stringify(map));
  outputStream.write(';\n');
  let path = import.meta.resolve('./lookup.js')
  if (path.startsWith('file://')) {
    path = path.slice(7);
  }
  outputStream.write(fs.readFileSync(path));
  outputStream.end();
};

export default function main() {
  console.log(chalk.blue("Building ip2country.js"));
  let out = async () => {
    let map = await getMap(true);
    let output = fs.createWriteStream('ip2country.js');
    return await buildOutput(map, output);
  }
  out().then((out) => {
    console.log(chalk.green("Done."));
  }
  ).catch((err) => {
    console.error(chalk.red("Error: " + err));
  });
};

main();