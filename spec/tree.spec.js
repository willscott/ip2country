/*jslint node: true */
/*globals describe, it, beforeEach, afterEach */

describe("Tree Creation", function () {
  'use strict';
  var ip2country = require('../ip2country'),
    tree = require('../src/tree'),
    expect = require('chai').expect;

  it("Handles basic containment and siblings", function () {
    var entries = {}, mytree;
    entries[ip2country.prefix('192.168.0.1', 16) + '/16'] = 'US';
    entries[ip2country.prefix('192.168.0.1', 8) + '/8'] = 'CN';
    entries[ip2country.prefix('193.168.0.1', 8) + '/8'] = 'BR';

    mytree = tree.tableToTree(entries);
    expect(mytree.children.length).to.equal(2);
    expect(mytree.children[0].value).to.equal('CN');
    expect(mytree.children[0].children[0].value).to.equal('US');
  });

  it("Handles sibling ordering", function () {
    var entries = {}, mytree;
    entries[ip2country.prefix('10.2.0.1', 16) + '/16'] = '2';
    entries[ip2country.prefix('10.4.0.1', 16) + '/16'] = '4';
    entries[ip2country.prefix('10.6.0.1', 16) + '/16'] = '6';
    entries[ip2country.prefix('10.0.0.1', 16) + '/16'] = '0';
    entries[ip2country.prefix('10.1.0.1', 16) + '/16'] = '1';
    entries[ip2country.prefix('10.3.0.1', 16) + '/16'] = '3';
    entries[ip2country.prefix('10.5.0.1', 16) + '/16'] = '5';
    entries[ip2country.prefix('10.7.0.1', 16) + '/16'] = '7';

    mytree = tree.tableToTree(entries);
    expect(mytree.children.length).to.equal(8);
    expect(mytree.children[0].value).to.equal('0');
    expect(mytree.children[7].value).to.equal('7');
  });

  it("knows what's before & after nodes", function () {
    var entries = {}, mytree, beforeNode, afterNode;
    entries[ip2country.prefix('10.2.0.1', 16) + '/16'] = '2';

    mytree = tree.tableToTree(entries);
    beforeNode = tree.beforeNode(mytree.children[0]);
    expect(beforeNode.ip).to.equal(ip2country.prefix('10.1.255.255', 32));
    expect(beforeNode.cidr).to.equal(32);

    afterNode = tree.afterNode(mytree.children[0]);
    expect(afterNode.ip).to.equal(ip2country.prefix('10.3.0.0', 32));
    expect(afterNode.cidr).to.equal(32);
  });

  it("Creates covering cidrs", function () {
    var entries = {}, mytree, adjacentNode, span;
    entries[ip2country.prefix('10.2.0.1', 16) + '/16'] = '2';

    mytree = tree.tableToTree(entries);

    adjacentNode = tree.beforeNode(mytree.children[0]);
    span = tree.span(adjacentNode, mytree.children[0]);
    expect(span.cidr).to.equal(14);
    expect(span.ip).to.equal(ip2country.prefix('10.1.255.255', 14));

    adjacentNode = tree.afterNode(mytree.children[0]);
    span = tree.span(adjacentNode, mytree.children[0]);
    expect(span.cidr).to.equal(15);
    expect(span.ip).to.equal(ip2country.prefix('10.2.0.1', 15));
  });

  it("Creates simple spans between cidrs", function () {
    var entries = {}, mytree, span;
    entries[ip2country.prefix('10.2.0.1', 16) + '/16'] = '2';
    entries[ip2country.prefix('10.4.0.1', 16) + '/16'] = '2';

    mytree = tree.tableToTree(entries);

    span = tree.createSpan(mytree.children[0], mytree.children[1], '3');
    expect(span.length).to.equal(1);
    expect(span[0].cidr).to.equal(16);
    expect(span[0].value).to.equal('3');
    expect(span[0].ip).to.equal(ip2country.prefix('10.3.0.1', 16));
  });

  it("Creates complex spans between cidrs", function () {
    var entries = {}, mytree, span;
    entries[ip2country.prefix('10.2.0.1', 17) + '/17'] = '2';
    entries[ip2country.prefix('10.4.255.1', 24) + '/24'] = '2';

    mytree = tree.tableToTree(entries);

    span = tree.createSpan(mytree.children[0], mytree.children[1], '3');
    // /17, /16, /17, /18, /19, /20, /21, /22, /23, /24
    expect(span.length).to.equal(10);
  });
});
