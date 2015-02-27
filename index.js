var Readable = require('stream').Readable,
  geohash = require('ngeohash'),
  pip = require('point-in-polygon'),
  turfExtent = require('turf-extent'),
  turfFeaturecollection = require('turf-featurecollection'),
  turfPolygon = require('turf-polygon'),
  turfIntersect = require('turf-intersect'),
  turf = {
  	extent: turfExtent,
  	featurecollection: turfFeaturecollection,
  	polygon: turfPolygon,
  	intersect: turfIntersect
  },
  through2 = require('through2'),
  async = require('async'),
  geojsonArea = require('geojson-area');

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
  options = options || {};
  var defaults = {
    precision: options.integerMode === true ? 32 : 6,
    rowMode: false,
    integerMode: false,
    geojson: [],
    splitAt: 2000,
    hashMode: 'inside',
    threshold: 0
  };
  for (var attrname in defaults) {
    this[attrname] = options.hasOwnProperty(attrname) && (options[attrname] !== null && typeof options[attrname] !== 'undefined') ? options[attrname] : defaults[attrname];
  }

  this.isMulti = Array.isArray(this.geojson[0][0][0]);
  this.geojson = !this.isMulti ? [this.geojson] : this.geojson;
  this.geojson = this.geojson.map(function (el) {
    return turf.polygon(el);
  });
  if (this.integerMode) {
  	this.geohashEncode = geohash.encode_int;
  	this.geohashDecode = geohash.decode_int;
  	this.geohashDecodeBbox = geohash.decode_bbox_int;
  	this.geohashNeighbor = geohash.neighbor_int;
  } else {
  	this.geohashEncode = geohash.encode;
  	this.geohashDecode = geohash.decode;
  	this.geohashDecodeBbox = geohash.decode_bbox;
  	this.geohashNeighbor = geohash.neighbor;
  }

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
      self.rowHash = self.geohashEncode(self.bounding[2], self.bounding[1], self.precision);
    }

    var rowBox = self.geohashDecodeBbox(self.rowHash, self.precision),
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
        
        var intersection = turf.intersect(turf.featurecollection([clipper]), turf.featurecollection([currentGeojson]));
        if(intersection && intersection.features.length) {
          // Calculate the row bounding and column hash based on the intersection
          var intersectionFeature = { type: 'Feature', geometry: intersection.features[0], properties: {} };
          var extent = turf.extent(turf.featurecollection([intersectionFeature]));
          // extent = [minX, minY, maxX, maxY], remap to match geohash lib
          self.rowBounding = [extent[1], extent[0], extent[3], extent[2]];
          var midY = self.rowBounding[0]+(self.rowBounding[2]-self.rowBounding[0])/2;
          columnHash = self.geohashEncode(midY, self.rowBounding[1], self.precision);
          next(null, intersection.features[0]);
        } else {
          next(null, currentGeojson.geometry);
        }
 
      } else {
          next(null, currentGeojson.geometry);
      }
    };


    preparePoly(function (err, prepared) {
      var columnCenter = self.geohashDecode(columnHash, self.precision),
        westerly = self.geohashNeighbor(self.geohashEncode(columnCenter.latitude, self.rowBounding[3], self.precision), [0, 1], self.precision);
      while (columnHash != westerly) {
        if(self.hashMode === 'inside' && inside(columnCenter, prepared)) {
          rowHashes.push(columnHash);
        } else if (self.hashMode === 'intersect' || self.hashMode === 'extent') {
          rowHashes.push(columnHash);
        }
        columnHash = self.geohashNeighbor(columnHash, [0, 1], self.precision);
        columnCenter = self.geohashDecode(columnHash, self.precision);
      }

      var southNeighbour = self.geohashNeighbor(self.rowHash, [-1, 0], self.precision);

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

      if(self.hashMode === 'inside' || self.hashMode === 'extent' || !rowHashes.length) {
        done(null, rowHashes);
      } else if (self.hashMode === 'intersect') {

        var baseArea = null;
        async.filter(rowHashes, function (h, cb) {
          var bb = self.geohashDecodeBbox(h, self.precision);
          bb = turf.polygon([[
                [bb[1], bb[2]],
                [bb[3], bb[2]],
                [bb[3], bb[0]],
                [bb[1], bb[0]],
                [bb[1], bb[2]]
              ]]);

          if(!baseArea) baseArea = geojsonArea.geometry(bb.geometry);

          var intersected = turf.intersect(turf.featurecollection([turf.polygon(prepared.coordinates)]), turf.featurecollection([bb]));
          var keepIntersection = !self.threshold ? true : false;
          if(self.threshold && intersected.features.length && (intersected.features[0].type === 'Polygon' || intersected.features[0].type === 'MultiPolygon')) {
            var intersectedArea = geojsonArea.geometry(intersected.features[0]);
            keepIntersection = baseArea && intersectedArea / baseArea >= self.threshold;
          }
          cb(keepIntersection);
        }, function (results) {
          done(null, results);
        });
      }

    });
  };

  if(!this.bounding) {
    var extent = turf.extent(turf.featurecollection([currentGeojson]));
    // extent = [minX, minY, maxX, maxY], remap to match geohash lib
    self.bounding = [extent[1], extent[0], extent[3], extent[2]];
    self.rowBounding = self.bounding.slice(0);
    makeRow();
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
    integerMode: options.integerMode ? true : false,
    hashMode: options.hashMode,
    threshold: options.threshold
  });
};
