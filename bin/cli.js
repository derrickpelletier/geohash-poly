#!/usr/bin/env node

var hasher = require('..');
var through2 = require('through2');
var geohash = require('ngeohash');

var options = require('rc')('geohash-poly', {
  precision: 7,
  hashMode: 'inside',
  rowMode: true,
  csv: false,
  geocode: false
})

options.coords = JSON.parse(options._);

var output = function(i, lat, lon){
  var obj = {hash: i};
  if (options.geocode){
    obj.lat = lat; obj.lon = lon;
  }
  console.log(JSON.stringify(obj))
}

if (options.csv) output = function(i, lat, lon) {
  var arr = [i];
  if (options.geocode){
    arr.push(lat);
    arr.push(lon);
  }
  console.log(arr.join(','));
}

hasher.stream(options).pipe(through2.obj(function (chunk, enc, cb) {

  chunk.toString().split(',').forEach(function(i){
    var coords = geohash.decode(i);
    output(i, coords.latitude, coords.longitude);
  })
  cb();
}));
