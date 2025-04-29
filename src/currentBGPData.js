/*jslint node:true, bitwise:true */
import fs from 'node:fs';
import http from 'node:http';
import chalk from 'chalk';
import es from 'event-stream';
import { spawn } from 'node:child_process';

import {checkCache} from './cache.js';

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
export async function loadIP2ASMap(when, nocache) {
  'use strict';
  var url = "http://archive.routeviews.org/dnszones/originas.bz2";
  // Note: routeviews will provide an IPv6 address, but the web server
  // doesn't listen on it appropriately. If your machine is ipv6 enabled
  // you will need to force an IPv4 connection by changing the above url
  // to "http://128.223.51.20/dnszones/originas.bz2".

  if (!nocache && checkCache('originas', 1000 * 60 * 60 * 24)) {
    console.log(chalk.blue("IP -> ASN Map Cached."));
    return 'originas';
  }
  console.log(chalk.blue("Downloading IP -> ASN Map"));

    var download = fs.createWriteStream('originas.bz2');

    http.get(url, function (res) {
      res.pipe(download);
      res.on('end', function () {
        console.log(chalk.blue("Uncompressing..."));
        // Note: We download the file and use the external bunzip2 utility
        // because the node seek-bzip and alternative JS native
        // implementations are orders of magnitude slower, and make this
        // a process which can't actually be done in a sane manner.
        var decompression = spawn('bunzip2', ['originas.bz2']);
        decompression.on('close', function (code) {
          if (code !== 0) {
            console.warn(chalk.red("Decompression failed:" + code));
            throw code
          } else {
            console.log(chalk.green("Done."));
            return 'originas';
          }
        });
      }).on('error', function (err) {
        console.warn(chalk.red("Download Failed:" + err));
        throw err
      });
    });
};

export function parseIP2ASMap(path) {
  'use strict';
  var map = {},
    file = fs.createReadStream(path);
  console.log(chalk.blue("Parsing IP -> ASN Map"));

  return new Promise(function (resolve, reject) {
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

export function cleanup(nocache) {
  if (nocache || (fs.existsSync('originas') &&
      (new Date() - fs.statSync('originas').ctime) / 1000 / 60 / 60 / 24 > 1)) {
    fs.unlinkSync('originas');
  }
};
