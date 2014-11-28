/*jslint node:true, bitwise:true */
/*globals table*/
/**
 * Retreive the cidr prefix to which an IP address belongs.
 * The IP can be passed as a string ('192.168.1.1') or as a long
 * numeric representation.
 * This is an IPv4 specific transformation.
 */
var prefix = function (ip, cidr) {
  'use strict';
  var subnet, bytes;

  if (typeof ip === 'string') {
    bytes = ip.split('.');
    if (bytes.length < 4) {
      return 'unknown';
    }
    subnet = new Buffer(bytes).readInt32BE(0);
  } else {
    subnet = ip;
  }

  bytes = subnet % (1 << cidr);
  if (bytes < 0) {
    bytes += (1 << cidr);
  }
  return subnet - bytes;
};

/**
 * return the country owning an arbitrary IP address or
 * 'unknown' if it could not be determined.
 * This method relies on the existance of a lookup table, named 'table',
 * which should be a dictionary where keys are subnet prefixes, which map
 * to an object keyed by CIDR and valued with countries.
 */
var lookup = function (table, ip) {
  'use strict';
  var subnet = prefix(ip, 32),
    cidr = 32,
    modulo = 0,
    keys,
    i;

  if (!ip || prefix === 'unknown') {
    return 'ZZ';
  }

  while (cidr > 0) {
    if (table[subnet]) {
      keys = Object.keys(table[subnet]);
      for (i = cidr; i > 0; i -= 1) {
        if (keys.indexOf(String(i)) >= 0) {
          return table[subnet][String(i)];
        }
      }
    }
    cidr -= 1;
    subnet = prefix(subnet, 32 - cidr);
  }
  return 'ZZ';
};

// This file can be concatinated to a pre-built table, or used
// for lookups directly.
if (typeof table === 'object') {
  module.exports = lookup.bind({}, table);
  exports.table = table;
}

exports.lookup = lookup;
exports.prefix = prefix;
