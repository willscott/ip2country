/*jslint node: true */
/*globals describe, it, beforeEach, afterEach */

describe("Tree Creation", function () {
  'use strict';
  var ip2country = require('../ip2country'),
    util = require('../src/util'),
    expect = require('chai').expect;

  it("Handles basic containment and siblings", function () {
    var entries = {}, tree;
    entries[ip2country.prefix('192.168.0.1', 16) + '/16'] = 'US';
    entries[ip2country.prefix('192.168.0.1', 8) + '/8'] = 'CN';
    entries[ip2country.prefix('193.168.0.1', 8) + '/8'] = 'BR';

    tree = util.tableToTree(entries);
    expect(tree.children.length).to.equal(2);
    expect(tree.children[0].value).to.equal('CN');
    expect(tree.children[0].children[0].value).to.equal('US');
  });

  it("Handles sibling ordering", function () {
    var entries = {}, tree;
    entries[ip2country.prefix('10.2.0.1', 16) + '/16'] = '2';
    entries[ip2country.prefix('10.4.0.1', 16) + '/16'] = '4';
    entries[ip2country.prefix('10.6.0.1', 16) + '/16'] = '6';
    entries[ip2country.prefix('10.0.0.1', 16) + '/16'] = '0';
    entries[ip2country.prefix('10.1.0.1', 16) + '/16'] = '1';
    entries[ip2country.prefix('10.3.0.1', 16) + '/16'] = '3';
    entries[ip2country.prefix('10.5.0.1', 16) + '/16'] = '5';
    entries[ip2country.prefix('10.7.0.1', 16) + '/16'] = '7';

    tree = util.tableToTree(entries);
    expect(tree.children.length).to.equal(8);
    expect(tree.children[0].value).to.equal('0');
    expect(tree.children[7].value).to.equal('7');
  });
});