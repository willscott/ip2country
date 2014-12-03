/*jslint node:true, bitwise:true */
/**
 * This file contains a set of utilities for understanding and manipulating
 * the ip to country map.
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

/**
 * Determine if a subnet contains another one.
 * Arguments are the 2 subnets in the long-ip/cidr form.
 */
exports.contains = function (parent, child) {
  'use strict';
  return (child.cidr > parent.cidr &&
          child.ip >= parent.ip &&
          child.ip < (parent.ip + (1 << (32 - parent.cidr))));
};

/**
 * Build the tree of entries in the ip to country table. The children of each
 * node will be the sub keys whose address space is fully contained by the
 * parent.
 */
exports.tableToTree = function (table) {
  'use strict';
  var keys = Object.keys(table),
    sorted,
    root;

  // sort by cidr.
  sorted = keys.sort(function (a, b) {
    var cidra = a.split('/')[1],
      cidrb = b.split('/')[1];
    return cidra - cidrb;
  });

  root = {ip: 0, cidr: 0, children: []};
  // add each key to the tree.
  sorted.forEach(function (key) {
    var parts = key.split('/'),
      node = {ip: parseInt(parts[0], 10), cidr: parseInt(parts[1], 10), key: key, value: table[key], children: []};

    exports.insertInTree(root, node);
  });

  return root;
};

/**
 * Insert a node into an IP prefix tree
 */
exports.insertInTree = function (root, node) {
  'use strict';
  var len = root.children.length,
    pos = Math.floor(len / 2);
  // Binary search the children to see if the node is contained by any of them.
  while (len >= 1) {
    if (root.children[pos].ip + (1 << (32 - root.children[pos].cidr)) <= node.ip) {
      pos = Math.floor(pos + len / 2);
    } else if (root.children[pos].ip > node.ip) {
      pos = Math.floor(pos - len / 2);
    }
    if (pos < 0) {
      pos = 0;
    } else if (pos >= root.children.length) {
      pos = root.children.length - 1;
    }
    len = Math.floor(len / 2);
  }

  if (root.children[pos] && exports.contains(root.children[pos], node)) {
    exports.insertInTree(root.children[pos], node);
  } else {
    // if not, insert the new node at this level.
    if (root.children[pos] && root.children[pos].ip + (1 << (32 - root.children[pos].cidr)) <= node.ip) {
      pos += 1;
    }
    root.children.splice(pos, 0, node);
  }
};

exports.findKey = function (node, key) {
  'use strict';
  if (node.key === key) {
    return node;
  } else {
    var i = 0,
      parts = key.split('/'),
      keyNode = {ip: parseInt(parts[0], 10), cidr: parseInt(parts[1], 10)};
    for (i = 0; i < node.children.length; i += 1) {
      if (exports.contains(node.children[i], keyNode)) {
        return exports.findKey(node.children[i], key);
      }
    }
  }
};

//Slow implementation of findKey which checks every node.
var fk = function (node, key) {
  'use strict';
  var i, k;

  if (node.key === key) {
    return node;
  } else {
    for (i = 0; i < node.children.length; i += 1) {
      k = fk(node.children[i], key);
      if (k) {
        return k;
      }
    }
  }
};

// Find a spanning prefix for two children prefixes.
exports.span = function (a, b) {
  'use strict';
  var node = {ip: 0, cidr: a.cidr, value: a.value, children: []};

  node.ip = Math.min(a.ip, b.ip);

  while (node.cidr > 0) {
    if (exports.contains(node, a) && exports.contains(node, b)) {
      return node;
    }
    node.cidr -= 1;
    node.ip = lookup.prefix(node.ip, node.cidr);
  }
  return node;
};


/**
 * Merge keys to fill in empty parts of the address space.
 * todo: merge full spans of same-value keys in one operation, such that the
 * tradeoff between number of shims needed versus number of keys merged can be
 * evaluated. and the merge can recurse beyond the top level.
 */
exports.safeMerge = function (node, parentValue) {
  'use strict';
  var i,
    j,
    merged,
    bad,
    nm = 0;
  for (i = 1; i < node.children.length; i += 1) {
    if (node.children[i].value === node.children[i - 1].value &&
        node.children[i].cidr === node.children[i - 1].cidr) {
      merged = exports.span(node.children[i], node.children[i - 1]);
      // Are there problems with this merged node?
      bad = false;
      j = i + 1;
      while (node.children[j] && exports.contains(merged, node.children[j])) {
        if (node.children[j].value !== merged.value) {
          bad = true;
        }
        j += 1;
      }
      j = i - 2;
      while (node.children[j] && exports.contains(merged, node.children[j])) {
        if (node.children[j].value !== merged.value) {
          bad = true;
        }
        j -= 1;
      }
      // Do the merge.
      if (!bad) {
        nm += 1;
        merged.children = node.children[i - 1].children;
        for (j = 0; j < node.children[i].children.length; j += 1) {
          merged.children.push(node.children[i].children[j]);
        }
        node.children.splice(i - 1, 2, merged);
        i -= 1;
      }
    }
  }
  return nm;
};

/**
 * Rearrange node & direct children if doing so can remove total number of nodes.
 */
exports.findRearrangements = function (node) {
  'use strict';
  return node;
};

/**
 * Flatten a tree of prefixes back to a flattened lookup table.
 */
exports.treeToTable = function (node) {
  'use strict';
  var table = {},
    childKeys,
    addKeys,
    i;
  addKeys = function (key) {
    table[key] = childKeys[key];
  };
  
  for (i = 0; i < node.children.length; i += 1) {
    table[node.children[i].key] = node.children[i].value;
    childKeys = exports.treeToTable(node.children[i]);
    Object.keys(childKeys).forEach(addKeys);
  }
  return table;
};
