# Geohash-poly

`npm install geohash-poly`

Transform a GeoJSON (Multi)Polygon to a list of geohashes that cover it.

Method used is pretty brute-force, but still relatively quick compared to alternative implementations if hash precision is not too granular. Creates an envelope around poly, and iterates over rows and columns, including relevant hashes with respect to `hashMode`.


## Streaming
Hashes can be streamed. Each _read will generate a row of hashes into buffer, as some form of throttling. This allows massive polygons with high precision hashes to avoid memory constraint issues. If your polys have the potential to hit memory issues, use this method.

If you specify rowMode as true, such as `.stream({..., rowMode: true, ...})`, each chunk in the stream will be an array using streams2 objectMode.

```javascript

var through2 = require('through2');

var polygon = [[[-122.350051, 47.702893 ], [-122.344774, 47.702877 ], [-122.344777, 47.70324 ], [-122.341982, 47.703234 ], [-122.341959, 47.701421 ], [-122.339749, 47.701416 ], [-122.339704, 47.69776 ], [-122.341913, 47.697797 ], [-122.341905, 47.697071 ], [-122.344576, 47.697084 ], [-122.344609, 47.697807 ], [-122.349999, 47.697822 ], [-122.350051, 47.702893 ]]];

var stream = geohashpoly.stream({
	coords: polygon, 
	precision: 7, 
	rowMode: true
});

stream
  .on('end', function () {
    console.log("It's all over.");
  })
  .pipe(through2(function (chunk, enc, callback) {
    console.log(chunk.toString());
    callback();
  }));

```

Results in the hashes spit out line by line to the console.


## Standard
If you just want your hashes out in an array, use this.
```javascript

var polygon = [[[-122.350051, 47.702893 ], [-122.344774, 47.702877 ], [-122.344777, 47.70324 ], [-122.341982, 47.703234 ], [-122.341959, 47.701421 ], [-122.339749, 47.701416 ], [-122.339704, 47.69776 ], [-122.341913, 47.697797 ], [-122.341905, 47.697071 ], [-122.344576, 47.697084 ], [-122.344609, 47.697807 ], [-122.349999, 47.697822 ], [-122.350051, 47.702893 ]]];

geohashpoly({coords: polygon, precision: 7}, function (err, hashes) {
	console.log(hashes);
});
```

Results in:
```
[ 'c22zrgg', 'c22zrgu', 'c22zrgv', 'c22zrgy', 'c22zrgz', 'c23p25b', 'c22zrge', 'c22zrgs', 'c22zrgt', 'c22zrgw', 'c22zrgx', 'c23p258', 'c23p259', 'c23p25d', 'c22zrg7', 'c22zrgk', 'c22zrgm', 'c22zrgq', 'c22zrgr', 'c23p252', 'c23p253', 'c23p256', 'c22zrg5', 'c22zrgh', 'c22zrgj', 'c22zrgn', 'c22zrgp', 'c23p250', 'c23p251', 'c23p254' ]
```

## Options

- `coords`: coordinate array for the geojson shape. **required**
- `precision`: geohash precision (eg. "gfjf1" is a precision 5 geohash).
- `rowMode`: allows for processing of geohashes by row.
- `hashMode`: defines filtering of returned geohashes. See below.



## hashMode

The `hashMode` option can be used to specify which hashes to return. Defaults to `'inside'`.

- `'inside'`: return hashes whose center points fall inside the shape.
- `'extent'`: return all hashes which make up the bounding box of the shape.
- `'intersect'`: return all hashes that intersect with the shape. Use the `'threshold'` option to specify a percentage of least coverage. See `examples/streaming.js`.