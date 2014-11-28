/**
 * Retreive the /24 class-c network in which an IP address belongs.
 * The IP can be passed as a string ('192.168.1.1') or as a long
 * numeric representation.
 * This is an IPv4 specific transformation.
 */
function getClassC(ip) {
  var classC, bytes;

  if (typeof ip === 'string') {
    bytes = ip.split('.');
    if (bytes.length < 4) {
      return 'unknown';
    }
    classC = new Buffer(bytes).readInt32BE(0);
  } else {
    classC = ip;
  }
  classC -= classC % 256;
  return classC;
};

/**
 * return the country owning an arbitrary IP address or
 * 'unknown' if it could not be determined.
 * This method relies on the existance of a lookup table, named 'table',
 * which should be a dictionary where keys are subnet prefixes, which map
 * to an object keyed by CIDR and valued with countries.
 */
module.exports = function (ip) {
  var classC = getClassC(ip),
    offset = 0,
    keys,
    i;

  if (!ip || classC === 'unknown') {
    return 'unknown';
  }

  while (offset < 16) {
    if (table[classC]) {
      keys = Object.keys(table[classC]);
      for (i = 24 - offset; i > 8; i -= 1) {
        if (keys.indexOf(String(i)) >= 0) {
          return table[classC][String(i)];
        }
      }
    }
    offset += 1;
    classC -= classC % (256 << (offset)); 
  }
  return 'unknown';
};