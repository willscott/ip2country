/*jslint node:true, bitwise:true */
/*globals table*/
/**
 * Retreive the cidr prefix to which an IP address belongs.
 * The IP can be passed as a string ('192.168.1.1') or as a long
 * numeric representation.
 * This is an IPv4 specific transformation.
 * @param {Integer} cidr, the number of bytes to keep. 32 keeps all bytes while
 *     0 removes all bytes.
 */
export function prefix(ip, cidr) {
  var subnet, bytes;

  if (typeof ip === 'string') {
    bytes = ip.split('.');
    if (bytes.length < 4) {
      return 'unknown';
    }
    subnet = Buffer.from(bytes).readUInt32BE(0);
  } else {
    subnet = ip;
  }

  // Handle shift edge cases in javascript
  if (cidr === 0) {
    return 0;
  } else if (cidr === 1) {
    return subnet >= 2147483648 ? 2147483648 : 0;
  } else {
    bytes = subnet % (1 << (32 - cidr));
    return subnet - bytes;
  }
};

/**
 * return the country owning an arbitrary IP address or
 * 'unknown' if it could not be determined.
 * This method relies on the existance of a lookup table, named 'table',
 * which should be a dictionary where keys are subnet prefixes, which map
 * to an object keyed by CIDR and valued with countries.
 */
export function lookup(table, ip) {
  var cidr = 32,
    subnet = prefix(ip, cidr);

  if (!ip || subnet === 'unknown') {
    return 'ZZ';
  }

  while (cidr > 0) {
    if (table[subnet + '/' + cidr]) {
      return table[subnet + '/' + cidr];
    }
    cidr -= 1;
    subnet = prefix(subnet, cidr);
  }
  return 'ZZ';
};

export default function(ip) {
  return lookup(table, ip)
};
