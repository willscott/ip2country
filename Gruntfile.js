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
  grunt.loadNpmTasks('grunt-bump');
  grunt.loadNpmTasks('grunt-publish');

  grunt.registerTask('build', 'Rebuild ip2country.js', function () {
    var build = require('./src/build'),
      done = this.async();

    build.getMap(grunt.option('verbose')).then(function (map) {
      var output = require('fs').createWriteStream('ip2country.js');
      return build.buildOutput(map, output);
    }).then(function() {
      done(true);
    }, function (err) {
      console.error(err);
      done(false);
    });
  });

  grunt.registerTask('test', ['jshint', 'mochaTest']);
  grunt.registerTask('default', ['build', 'test']);
};
