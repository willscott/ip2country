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

