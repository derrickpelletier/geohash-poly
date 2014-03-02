var Readable = require('stream').Readable,
  geohash = require('ngeohash'),
  pip = require('point-in-polygon'),
  turf = require('turf'),
  through2 = require('through2'),
  async = require('async');

/**
 * utilizing point-in-poly but providing support for geojson polys and holes.
 */
var inside = function (point, features) {
  var geopoly = features.features[0],
    inside = 0;
  
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
    geojson: []
  }
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
}
require('util').inherits(Hasher, Readable);


/**
 * _read(), for Readable
 * gets your next row of hashes.
 * If not in rowMode, will push each hash to buffer
 * if there are no polygons remaining in the geojson, push null to end stream
 */
Hasher.prototype._read = function (size) {
  var self = this
  var hashes = [];
  async.doUntil(function (callback) {
    self.getNextRow(function (err, results) {
      hashes = results;
      callback(err);
    });
  }, function () {
    return hashes.length || !self.geojson.length;
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
 * will get the next row of geohashes for the current index-0 polygon in the list.
 * only uses the current row bounds for checking pointinpoly
 * rowHash persists so that it is available on the next iteration while the poly is still the same
 */
Hasher.prototype.getNextRow = function (next) {
  var self = this;

  var makeRow = function () {

    if(!self.rowHash) {
      self.rowHash = geohash.encode(self.bounding[2], self.bounding[1], self.precision);
    }

    var rowBox = geohash.decode_bbox(self.rowHash),
      columnHash = self.rowHash,
      columnCenter = geohash.decode(columnHash),
      rowBuffer = 0.0002,
      rowHashes = [];

    clipper = turf.polygon([[
      [ self.bounding[1] - rowBuffer, rowBox[2] + rowBuffer], // nw
      [ self.bounding[3] + rowBuffer, rowBox[2] + rowBuffer], // ne
      [ self.bounding[3] + rowBuffer, rowBox[0] - rowBuffer], // se
      [ self.bounding[1] - rowBuffer, rowBox[0] - rowBuffer], //sw
      [ self.bounding[1] - rowBuffer, rowBox[2] + rowBuffer] //nw
    ]]);

    turf.intersect(turf.featurecollection([clipper]), turf.featurecollection([self.geojson[0]]), function (err, intersection) {
      if(intersection && intersection.features.length) {
        var westerly = geohash.neighbor(geohash.encode(columnCenter.latitude, self.bounding[3], self.precision), [0, 1]);
        while (columnHash != westerly) {
          if(inside(columnCenter, intersection)) rowHashes.push(columnHash);
          columnHash = geohash.neighbor(columnHash, [0, 1]);
          columnCenter = geohash.decode(columnHash);
        }

        self.rowHash = geohash.neighbor(self.rowHash, [-1, 0]);

        if(rowBox[2] <= self.bounding[0]) {
          self.geojson.shift();
          self.rowHash = null;
          self.bounding = null;
        }
      }
      next(null, rowHashes);
    });
  };

  if(!this.bounding) {
    turf.extent(turf.featurecollection([this.geojson[0]]), function (err, extent) {
      // extent = [minX, minY, maxX, maxY], remap to match geohash lib
      self.bounding = [extent[1], extent[0], extent[3], extent[2]];
      makeRow();
    })
  } else {
    makeRow();
  }
    
};


/**
 * intializes the Hasher, but processes the results before returning an array.
 */
var polygonHash = module.exports = function (coords, precision, next) {
  var hasher = streamer(coords, precision, true);
  var results = [];
  hasher
    .on('end', function () {
      next(null, results)
    })
    .pipe(through2.obj(function (arr, enc, callback) {
      results = results.concat(arr);
      callback();
    }));
};


/**
 * initializes the Hasher, as a stream
 */
var streamer = module.exports.stream = function (coords, precision, rowMode) {
  return new Hasher({
    geojson: coords,
    precision: precision,
    rowMode: rowMode ? true : false
  });
};
