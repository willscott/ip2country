/*jslint node:true */
module.exports = function (grunt) {
  'use strict';
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      all: ['src/*.js', 'spec/*.js']
    },
    mochaTest: {
      test: {
        options: {
          reporter: 'spec',
          quiet: false
        },
        src: ['spec/**.js']
      }
    }
  });
  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.registerTask('build', 'Rebuild ip2country.js', function () {
    var build = require('./src/build'),
      done = this.async();

    build.getMap().then(function (map) {
      var output = require('fs').createWriteStream('ip2country.js');
      build.buildOuptut(map, output);
      require('fs').unlinkSync('originas');
      done(true);
    }, function (err) {
      done(false);
    });
  });

  grunt.registerTask('test', ['jshint', 'mochaTest']);
  grunt.registerTask('default', ['build', 'test']);
};