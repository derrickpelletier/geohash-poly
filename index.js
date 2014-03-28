var Readable = require('stream').Readable,
  geohash = require('ngeohash'),
  pip = require('point-in-polygon'),
  turf = require('turf'),
  through2 = require('through2'),
  async = require('async');

/**
 * utilizing point-in-poly but providing support for geojson polys and holes.
 */
var inside = function (point, geopoly) {
  var inside = 0;
  
  if(geopoly.type !== "Polygon" && geopoly.type !== "MultiPolygon") return false;
  
  var shape = geopoly.type === 'Polygon' ? [geopoly.coordinates] : geopoly.coordinates;
  shape.forEach(function (polygon, ind) {
    polygon.forEach(function (ring, ind) {
      if(pip([point.longitude, point.latitude], ring)) inside++;
    });
  });
  return inside % 2;
};


/*
 * Hasher, extends Readable
 * a stream that will provide a readable list of hashes, row by row.
 *
 * Calculate geohashes of specified precision that cover the (Multi)Polygon provided
 * Note, duplicates may occur.
 */
var Hasher = function (options) {
  var defaults = {
    precision: 6,
    rowMode: false,
    geojson: [],
    splitAt: 2000,
    hashMode: 'inside'
  };
  options = options || {};
  for (var attrname in defaults) {
    this[attrname] = options.hasOwnProperty(attrname) && (options[attrname] !== null && typeof options[attrname] !== 'undefined') ? options[attrname] : defaults[attrname];
  }

  this.isMulti = Array.isArray(this.geojson[0][0][0]);
  this.geojson = !this.isMulti ? [this.geojson] : this.geojson;
  this.geojson = this.geojson.map(function (el) {
    return turf.polygon(el);
  });

  Readable.call(this, {
    objectMode: this.rowMode
  });
};
require('util').inherits(Hasher, Readable);


/**
 * _read(), for Readable
 * gets your next row of hashes.
 * If not in rowMode, will push each hash to buffer
 * if there are no polygons remaining in the geojson, push null to end stream
 */
Hasher.prototype._read = function (size) {
  var self = this;
  var hashes = [];
  async.whilst(function () {
    return !hashes.length && self.geojson.length;
  }, function (callback) {
    self.getNextRow(function (err, results) {
      hashes = results || [];
      callback(err);
    });
  }, function () {
    if(!self.geojson.length && !hashes.length) return self.push(null);
    if(self.rowMode) return self.push(hashes);
    hashes.forEach(function (h) {
      self.push(h);
    });
  });
};


/**
 * getNextRow()
 * will get the next row of geohashes for the current length-1 polygon in the list.
 * only uses the current row bounds for checking pointinpoly
 * rowHash persists so that it is available on the next iteration while the poly is still the same
 */
Hasher.prototype.getNextRow = function (done) {
  var self = this,
    currentGeojson = self.geojson[self.geojson.length-1];

  var makeRow = function () {

    if(!self.rowHash) {
      self.rowHash = geohash.encode(self.bounding[2], self.bounding[1], self.precision);
    }

    var rowBox = geohash.decode_bbox(self.rowHash),
      columnHash = self.rowHash,
      rowBuffer = 0.0002,
      rowHashes = [];

    var preparePoly = function (next) {
      // Detect poly length
      if(self.hashMode !== 'extent' && currentGeojson.geometry.coordinates[0].length >= self.splitAt) {

        clipper = turf.polygon([[
          [ self.bounding[1] - rowBuffer, rowBox[2] + rowBuffer], // nw
          [ self.bounding[3] + rowBuffer, rowBox[2] + rowBuffer], // ne
          [ self.bounding[3] + rowBuffer, rowBox[0] - rowBuffer], // se
          [ self.bounding[1] - rowBuffer, rowBox[0] - rowBuffer], //sw
          [ self.bounding[1] - rowBuffer, rowBox[2] + rowBuffer] //nw
        ]]);
        
        turf.intersect(turf.featurecollection([clipper]), turf.featurecollection([currentGeojson]), function (err, intersection) {
          var prepare = null;
          if(intersection && intersection.features.length) {

            // Calculate the row bounding and column hash based on the intersection
            var intersectionFeature = { type: 'Feature', geometry: intersection.features[0], properties: {} };
            turf.extent(turf.featurecollection([intersectionFeature]), function (err, extent) {
              // extent = [minX, minY, maxX, maxY], remap to match geohash lib
              self.rowBounding = [extent[1], extent[0], extent[3], extent[2]];
              var midY = self.rowBounding[0]+(self.rowBounding[2]-self.rowBounding[0])/2;
              columnHash = geohash.encode(midY, self.rowBounding[1], self.precision);
              next(err, intersection.features[0]);
            });
          } else {
            next(null, currentGeojson.geometry);
          }
        });

      } else {
          next(null, currentGeojson.geometry);
      }
    };


    preparePoly(function (err, prepared) {
      var columnCenter = geohash.decode(columnHash),
        westerly = geohash.neighbor(geohash.encode(columnCenter.latitude, self.rowBounding[3], self.precision), [0, 1]);
      while (columnHash != westerly) {
        if(self.hashMode !== 'inside' || inside(columnCenter, prepared)) rowHashes.push(columnHash);
        columnHash = geohash.neighbor(columnHash, [0, 1]);
        columnCenter = geohash.decode(columnHash);
      }

      var southNeighbour = geohash.neighbor(self.rowHash, [-1, 0]);

      // Check if the current rowHash was already the most southerly hash on the map.
      // Also check if we are at or past the bottom of the bounding box.
      if(southNeighbour === self.rowHash || rowBox[0] <= self.bounding[0]) {
        self.geojson.pop();
        self.rowHash = null;
        self.bounding = null;
        self.rowBounding = null;
      } else {
        self.rowHash = southNeighbour;
      }
      done(null, rowHashes);

    });
  };

  if(!this.bounding) {
    turf.extent(turf.featurecollection([currentGeojson]), function (err, extent) {
      // extent = [minX, minY, maxX, maxY], remap to match geohash lib
      self.bounding = [extent[1], extent[0], extent[3], extent[2]];
      self.rowBounding = self.bounding.slice(0);
      makeRow();
    });
  } else {
    makeRow();
  }
    
};


/**
 * intializes the Hasher, but processes the results before returning an array.
 */
var polygonHash = module.exports = function (options, next) {
  options.rowMode = true;
  var hasher = streamer(options);
  var results = [];
  hasher
    .on('end', function () {
      next(null, results);
    })
    .pipe(through2.obj(function (arr, enc, callback) {
      results = results.concat(arr);
      callback();
    }));
};


/**
 * initializes the Hasher, as a stream
 */
// var streamer = module.exports.stream = function (coords, precision, rowMode, hashMode) {
var streamer = module.exports.stream = function (options) {
  return new Hasher({
    geojson: options.coords,
    precision: options.precision,
    rowMode: options.rowMode ? true : false,
    hashMode: options.hashMode
  });
};
