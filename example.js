//GIST
var hasher = require('./index'),
  through2 = require('through2');

var poly = [[[-122.350051, 47.702893 ], [-122.344774, 47.702877 ], [-122.344777, 47.70324 ], [-122.341982, 47.703234 ], [-122.341959, 47.701421 ], [-122.339749, 47.701416 ], [-122.339704, 47.69776 ], [-122.341913, 47.697797 ], [-122.341905, 47.697071 ], [-122.344576, 47.697084 ], [-122.344609, 47.697807 ], [-122.349999, 47.697822 ], [-122.350051, 47.702893 ]]];
var stream = hasher.stream(poly, 7);

stream
  .on('end', function () {
    console.log("It's all over.");
  })
  .pipe(through2(function (chunk, enc, callback) {
    console.log(chunk.toString());
    callback();
  }));
