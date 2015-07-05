IP 2 Country
============

IP 2 Country provides a current lookup table to geolocate IP address to
the countries in which they are most probably located. Distributed as a
stand-alone NPM module with no dependencies, the list is created at publication
time. This mapping is generated through the use of two databases:

 * [autnums](http://www.cidr-report.org/as2.0/autnums.html) Provides a
    textual descriptiosn of each registered ASN, including the country to which
    that ASN is registered.
 * [routeviews.org orginas](http://www.routeviews.org/) Provides a
    current list of BGP announcements, allowing us to understand which ASNs
    are announcing ownership of which IP prefixes.

Size
-----

```
2.0M ip2country.js
510K ip2country.js.gz
```

Installation
-----

```
  npm install ip2country
```

Usage
-----

```javascript
var ip2country = require('ip2country');
var country = ip2country(ip);
```

Advanced Usage
--------------

There are several related lookup tables for IP addresses that may be of use.
While not published for direct consumption, this library contains the tools
to generate those tables for your process. This functionality is accessed
through the ```getGenericMap()``` function in build.js. In particular, the
following knobs are exposed when generating the lookup table:

  * compress - Should the table be de-duplicated? When false the table will be
    faster to generate but slower to look up.
  * toCountry - Should the ip-ASN table be joined with an ASN-country table?
    When false an IP-ASN lookup table will be generated.
  * when - At what point should the table be generated? If set, the full RIB -
    routing information base - from the given time will be loaded and an
    originas extracted from that file (see historicBGPData.js).
  * nocache - Should a new originas be downloaded even if one already exists
    on disk? (defaults to false).
