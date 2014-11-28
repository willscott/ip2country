/*jslint node:true*/
/**
 * BunzipStream provides a stream wrapper around seek-bzip, as used in the
 * provided sample:
 * https://github.com/cscott/seek-bzip/blob/master/test/stream.js
 */
var stream = require('stream');
var Fiber = require('fibers');
var Bunzip = require('seek-bzip');

var BunzipStream = function () {
  'use strict';
  var trans = this;
  stream.Transform.call(trans); // initialize superclass.
  this._fiber = new Fiber(function () {
    var buffer = [], pos = 0;
    var inputStream = new Bunzip.Stream();
    inputStream.readByte = function () {
      if (pos >= buffer.length) {
        buffer = Fiber.yield();
        pos = 0;
      }
      return buffer[pos++];
    };
    var outputStream = new Bunzip.Stream();
    outputStream.writeByte = function (_byte) {
      this.write(new Buffer([_byte]), 0, 1);
    };
    outputStream.write = function (buffer, bufOffset, length) {
      if (bufOffset !== 0 || length !== buffer.length) {
        buffer = buffer.slice(bufOffset, bufOffset + length);
      }
      trans.push(buffer);
    };
    Bunzip.decode(inputStream, outputStream);
  });
  this._fiber.run();
};
BunzipStream.prototype = Object.create(stream.Transform.prototype);
BunzipStream.prototype._transform = function (chunk, encoding, callback) {
  'use strict';
  this._fiber.run(chunk);
  callback();
};

module.exports = BunzipStream;