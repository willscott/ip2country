IP 2 Country
============

IP 2 Country provides a current lookup table to geolocate IP address to
the countries in which they are most probably located. Distributed as a
stand-alone NPM module with no dependencies, the list is created at publication
time. This mapping is generated through the use of two databases:

 * [bgp-originas](http://www.cidr-report.org/as2.0/bgp-originas.html) Provides
    textual descriptiosn of each registered ASN, including the country to which
    that ASN is registered.
 * [orginas](http://archive.routeviews.org/dnszones/originas.bz2) Provides a
    current list of BGP announcements, allowing us to understand which ASN is
    announcing ownership of which IP prefixes.

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

