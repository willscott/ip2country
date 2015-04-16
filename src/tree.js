/*jslint node:true, bitwise:true */
/**
 * This file contains a set of utilities for working with the prefix map
 * in he form of prefix trees, where it is conceptually easier to understand
 * how to proplery insert and re-arrange entries safely.
 */
var lookup = require('./lookup');

/**
 * Determine if one prefix node (parent) contains another (child)
 */
exports.contains = function (parent, child) {
  'use strict';
  return (child.cidr > parent.cidr &&
          child.ip >= parent.ip &&
          child.ip < (parent.ip + (1 << (32 - parent.cidr))));
};

/**
 * Build the tree of entries in the ip to country table. The `children` of each
 * node will be the keys whose address space is fully contained by the
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
      node = {
        ip: parseInt(parts[0], 10),
        cidr: parseInt(parts[1], 10),
        key: key,
        value: table[key],
        children: []
      };

    exports.insertInTree(root, node);
  });

  return root;
};

/**
 * Print the human readable cidr representation of a tree node.
 */
exports.toString = function (node) {
  'use strict';
  var buf = new Buffer(4);
  buf.writeUInt32BE(node.ip, 0);
  return buf[0] + '.' + buf[1] + '.' + buf[2] + '.' + buf[3] +
      '/' + node.cidr + ' - ' + node.value;
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
    if (exports.precedes(root.children[pos], node)) {
      pos = Math.floor(pos + len / 2);
    } else if (exports.precedes(node, root.children[pos])) {
      pos = Math.floor(pos - len / 2);
    }
    if (pos < 0) {
      pos = 0;
    } else if (pos >= root.children.length) {
      pos = root.children.length - 1;
    }
    len = Math.floor(len / 2);
  }

  if (root.children[pos] && root.children[pos].ip +
      (1 << (32 - root.children[pos].cidr)) <= node.ip) {
    pos += 1;
  }

  if (root.children[pos] && exports.contains(root.children[pos], node)) {
    return exports.insertInTree(root.children[pos], node);
  } else {
    // Find containment range of existing children than should be in the node.
    var children, start = pos, end = pos;
    for (start = pos; start >= 0; start -= 1) {
      if (!root.children[start] || !exports.contains(node, root.children[start])) {
        break;
      }
    }
    for (end = pos; end < root.children.length; end += 1) {
      if (!exports.contains(node, root.children[end])) {
        break;
      }
    }
    children = root.children.splice(start, end-start, node);
    children.forEach(exports.insertInTree.bind({}, node));

    return [root, start];
  }
};

/**
 * locate a key is in the tree representation of ip lookup data.
 */
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

// Slow implementation of findKey which checks every node. Useful to understand
// if the tree has been built incorrectly.
var slow_findKey = function (node, key) {
  'use strict';
  var i, k;

  if (node.key === key) {
    return node;
  } else {
    for (i = 0; i < node.children.length; i += 1) {
      k = slow_findKey(node.children[i], key);
      if (k) {
        return k;
      }
    }
  }
};

// Find a spanning prefix for two children prefixes.
exports.span = function (a, b) {
  'use strict';
  var node = {ip: Math.min(a.ip, b.ip), cidr: a.cidr, value: a.value, children: []};

  while (node.cidr > 0) {
    if (exports.contains(node, a) && exports.contains(node, b)) {
      return node;
    }
    node.cidr -= 1;
    node.ip = lookup.prefix(node.ip, node.cidr);
  }
  node.key = node.ip + '/' + node.cidr;
  return node;
};

// Return an array of nodes from the end of (ip/cidr) node 'from' to the
// beginning of (ip/cidr) node 'to'.
exports.createSpan = function (from, to, value) {
  'use strict';
  var ret = [],
    at = from,
    item = {},
    candidate;
  while (exports.afterNode(at).ip < to.ip) {
    item = exports.afterNode(at);
    item.value = value;
    candidate = lookup.prefix(item.ip, item.cidr - 1);
    while (!exports.contains({ip: candidate, cidr: item.cidr - 1}, at) &&
           candidate + (1 << (32 + 1 - item.cidr)) <= to.ip) {
      item.cidr -= 1;
      item.ip = candidate;
      candidate = lookup.prefix(item.ip, item.cidr - 1);
    }
    ret.push(item);
    at = item;
  }
  return ret;
};


// Flatten out direct children of a node with the same value.
exports.dedup = function (node) {
  'use strict';
  var i,
    child;
  for (i = 0; i < node.children.length; i += 1) {
    if (node.children[i].value === node.value) {
      child = node.children.splice(i, 1, node.children[i].children);
      i -= 1;
    }
  }
  return node;
};

// Perform a shallow clone of a node
exports.clone = function (node) {
  'use strict';
  var newNode = {ip: node.ip, cidr: node.cir, value: node.value};
  newNode.children = [].concat(node.children);
  return newNode;
};


// Create a node representing the single IP before a given cidr range.
exports.beforeNode = function (node) {
  'use strict';
  var newNode = {ip: node.ip - 1, cidr: 32, value: node.value, children: []};
  return newNode;
};

// Create a node representing the single IP after a given cidr range.
exports.afterNode = function (node) {
  'use strict';
  var newNode = {ip: node.ip + (1 << (32 - node.cidr)), cidr: 32, value: node.value, children: []};
  return newNode;
};

// Return true if a precedes b in the IP address space.
exports.precedes = function (a, b) {
  return (a.ip + (1 << 32 - a.cidr) <= b.ip);
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
    tomerge = [],
    bad,
    nm = 0;
  for (i = 1; i < node.children.length; i += 1) {
    if (i >= 1 && node.children[i].value === node.children[i - 1].value) {
      merged = exports.span(node.children[i], node.children[i - 1]);
      tomerge = [];
      // Are there problems with this merged node?
      bad = false;
      j = i + 1;
      while (node.children[j] && exports.contains(merged, node.children[j])) {
        if (node.children[j].value !== merged.value) {
          bad = true;
        }
        tomerge.push(node.children[j]);
        j += 1;
      }
      j = i - 2;
      while (node.children[j] && exports.contains(merged, node.children[j])) {
        if (node.children[j].value !== merged.value) {
          bad = true;
        }
        tomerge.push(node.children[j]);
        j -= 1;
      }

      // Do the merge.
      if (!bad) {
        nm += 1;
        merged.children = node.children[i - 1].children;
        for (j = 0; j < node.children[i].children.length; j += 1) {
          exports.insertInTree(merged, node.children[i].children[j]);
        }
        node.children.splice(i - 1, 2);
        j = i;
        for (j = 0; j < tomerge.length; j += 1) {
          exports.insertInTree(merged, tomerge[j]);
          node.children.splice(node.children.indexOf(tomerge[j]), 1);
        }
        var nr = exports.insertInTree(node, merged);
        i -= (1 + tomerge.length);
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
  var vcounts = {},
    keys,
    i = 0,
    maxCount = 0,
    maxVal,
    candidate,
    spliceStart,
    spliceEnd;
  // Need to make this worthwhile...
  if (node.children.length < 3) {
    return node;
  }

  for (i = 0; i < node.children.length; i += 1) {
    if (!vcounts[node.children[i].value]) {
      vcounts[node.children[i].value] = 0;
    }
    vcounts[node.children[i].value] += 1;
  }

  keys = Object.keys(vcounts);
  for (i = 0; i < keys.length; i += 1) {
    if (vcounts[keys[i]] > maxCount) {
      maxCount = vcounts[keys[i]];
      maxVal = keys[i];
    }
  }

  candidate = exports.span(exports.firstOf(node, maxVal), exports.lastOf(node, maxVal));
  // push in the children that are covered by the candidate.
  for (i = 0; i < node.children.length; i += 1) {
    if (exports.contains(candidate, node.children[i])) {
      candidate.children.push(node.children[i]);
    }
  }
  spliceStart = node.children.indexOf(candidate.children[0]);
  spliceEnd = node.children.indexOf(candidate.children[candidate.children.length - 1]);

  // Any address space not covered by children require insertion of new nodes to revert to parent value.
  candidate.newChildren = [];
  for (i = 0; i < candidate.children.length; i += 1) {
    candidate.newChildren = candidate.newChildren.concat(exports.createSpan(
      (i === 0) ? exports.beforeNode(node) : candidate.children[i - 1],
      candidate.children[i],
      node.value
    ));
    candidate.newChildren.push(candidate.children[i]);
  }
  if (candidate.children.length) {
    candidate.children = candidate.newChildren.concat(exports.createSpan(
      candidate.children[candidate.children.length - 1],
      exports.afterNode(node),
      node.value
    ));
  }
  delete candidate.newChildren;

  exports.dedup(candidate);

  maxCount = 0;
  for (i = spliceStart; i < spliceEnd; i += 1) {
    maxCount += exports.treeSize(node.children[i]);
  }

  if (exports.treeSize(candidate) < maxCount) {
    // replace.
    node.children.splice(spliceStart, spliceEnd - spliceStart, candidate);
  }

  return node;
};

// Total number of nodes in a tree
exports.treeSize = function (node) {
  'use strict';
  var sum = 1,
    i = 0;
  for (i = 0; i < node.children.length; i += 1) {
    sum += exports.treeSize(node.children[i]);
  }
  return sum;
};

// Get the first child of a node which has a given value;
exports.firstOf = function (node, value) {
  'use strict';
  var i;
  for (i = 0; i < node.children.length; i += 1) {
    if (node.children[i].value === value) {
      return node.children[i];
    }
  }
  return null;
};

// Get the last child of a node which has a given value;
exports.lastOf = function (node, value) {
  'use strict';
  var i;
  for (i = node.children.length - 1; i >= 0; i -= 1) {
    if (node.children[i].value === value) {
      return node.children[i];
    }
  }
  return null;
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
