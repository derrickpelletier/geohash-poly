var hasher = require('..');
var through2 = require('through2');

var options = require('rc')('geohash-poly', {
  precision: 7,
  hashMode: 'inside',
  rowMode: true,
  csv: false
})

options.coords = JSON.parse(options._);

var output = function(i){
  console.log(JSON.stringify({hash: i}))
}

if (options.csv) output = function(i) { // see #1 for
  console.log(i);
}

hasher.stream(options).pipe(through2.obj(function (chunk, enc, cb) {

  chunk.toString().split(',').forEach(function(i){
    output(i);
  })
  cb();
}));
