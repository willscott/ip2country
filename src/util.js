/*jslint node:true, bitwise:true */
/**
 * This file holds additional utilities for working with the IP map:
 * Understanding what key an IP resolves to, and working with specific
 * cascades of keys.
 */
var lookup = require('./lookup');

/**
 * Resolve the ip to country entry that will be used for a given IP.'
 */
exports.resolve = function (table, ip) {
  'use strict';
  var cidr = 32,
    subnet = lookup.prefix(ip, cidr);

  while (cidr > 0) {
    if (table[subnet + '/' + cidr]) {
      return subnet + '/' + cidr;
    }
    cidr -= 1;
    subnet = lookup.prefix(subnet, cidr);
  }
  return null;
};

