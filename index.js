#!/usr/bin/env node

var fs = require('fs');

var path = require('path');

var child = require('child_process');

var watchman = require('fb-watchman');

var minimist = require('minimist');

var which = require('which');

var client = new watchman.Client();

var cwd = process.cwd();

var subscriptionPrefix = 'pulp-';

function subscribeToWatch(watchDirectory, watch, relativePath, callback) {
  client.command(['clock', watch], function(error, res){
    if (error) callback(error);
    else {
      var sub = {
        expression: ['anyof', ['match', '*.purs'], ['match', '*.js']],
        fields: ['name', 'size', 'exists', 'type'],
        since: res.clock,
        relative_root: relativePath
      };

      var subscriptionName = subscriptionPrefix + watchDirectory;

      client.command(['subscribe', watch, subscriptionName, sub], function(error, res){
        if (error) callback(error);
        else {
          client.on('subscription', function(res){
            if (res.subscription === subscriptionName) {
              callback(null);
            }
          });
        }
      });
    }
  });
}

function watchProject(watchDirectory, callback) {
  client.command(['watch-project', watchDirectory], function (error, res){
    if (error) callback(error);
    else {
      var watch = res.watch;

      var relativePath = res.relative_path;

      if (res.warning) {
        console.error('Warning: ' + res.warning);
      }

      console.log('Watch established on ' + watch + ' with relative path ' + relativePath);

      callback(null, {watch: watch, relativePath: relativePath});
    }
  });
}

function watch(watchDirectories, callback) {
  client.capabilityCheck({optional:[], required:['relative_root']}, function (error, res){
    if (error) {
      console.error('Watchman capability check failed. ' + error);

      client.end();
    }
    else {
      watchDirectories.forEach(function(watchDirectory){
        watchProject(watchDirectory, function(error, res){
          if (error) console.error('Failed to watch project ' + watchDirectory + '. ' + error);
          else {
            subscribeToWatch(watchDirectory, res.watch, res.relativePath, function(error){
              if (error) console.error('Failed to subscribe to watch. ' + error);
              else {
                callback();
              }
            });
          }
        });
      });
    }
  });
}

function run() {
  var pulp = fs.realpathSync(which.sync('pulp'));

  var args = process.argv.slice(2);

  var argv = minimist(args);

  var src = argv['src-path'] || 'src';

  var dependency = argv['dependency-path'] || 'bower_components';

  var test = argv['test-path'] || 'test';

  var directories =  [path.join(cwd, src), path.join(cwd, dependency), path.join(cwd, test)];

  var proc = child.fork(pulp, args);

  var change = function() {
    proc.kill('SIGTERM');
    proc = child.fork(pulp, args);
  };

  watch(directories, change);
};

run();
