/*jslint node: true */
/*globals describe, it, beforeEach, afterEach */

describe("IP2Country", function () {
  'use strict';
  var ip2country = require('../ip2country'),
    expect = require('chai').expect;

  it("Geolocates IPs appropriately.", function () {
    // Google Public DNS.
    expect(ip2country('8.8.8.8')).to.equal('US');
    // University of Washington.
    expect(ip2country('128.208.4.1')).to.equal('US');
    // Der Spiegel
    expect(ip2country('62.138.116.3')).to.equal('DE');
    // Baidu
    expect(ip2country('220.181.57.216')).to.equal('CN');
    // Iceland Government
    expect(ip2country('79.171.102.37')).to.equal('IS');
  });
});