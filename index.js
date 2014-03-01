var Readable = require('stream').Readable,
  geohash = require('ngeohash'),
  pip = require('point-in-polygon'),
  util = require('util'),
  turf = require('turf');


/**
 * utilizing point-in-poly but providing support for geojson polys and holes.
 */
var inside = function (point, features) {
  var inside = 0;
  var geopoly = features.features[0]

  if(geopoly.type !== "Polygon" && geopoly.type !== "MultiPolygon") {
    return false;
  }
  

  try {
    for(var a = 0; a < geopoly.coordinates.length; a++) {
      var polygon = geopoly.coordinates[a];
      if(geopoly.type === "Polygon") {
        // console.log(geopoly.type, geopoly.type === "Polygon", ring)
        inside += pip([point.longitude, point.latitude], polygon) ? 1 : 0;  
      } else {
        for(var b = 0; b < polygon.length; b++) {
          var ring = polygon[b];
          inside += pip([point.longitude, point.latitude], ring) ? 1 : 0;
        }
      }
    }
  } catch (err) {
    console.log(features, err)
    throw err
  }
  return inside % 2;
}


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
  
  for(var i = 0; i < this.geojson.length; i++) {
    this.geojson[i] = turf.polygon(this.geojson[i]);
  }

  this.buffer = [];

  Readable.call(this, {
    objectMode: this.rowMode
  });
}
util.inherits(Hasher, Readable);


/**
 * _read(), for Readable
 * gets the next row of hashes, can technically be large, but still throttles processing effectively
 * pushes each hash to the buffer individually
 * if there are no polygons remaining in the geojson, push null to end stream
 */
Hasher.prototype._read = function (size) {
  // still some hashes in the buffer, no rush.
  if(!this.geojson.length) return this.push(null);
  var self = this
  this.getNextRow(function (hashes) {
    self.push(hashes);
  });
  
};


/**
 * getNextRow()
 * will get the next row of geohashes for the current index-0 polygon in the list.
 * rowHash persists so that it is available on the next iteration while the poly is still the same
 */
Hasher.prototype.getNextRow = function (next) {
  var self = this,
    poly = this.geojson[0],
    rowHashes = [];

  var makeRow = function () {

    if(!self.rowHash) self.rowHash = geohash.encode(self.bounding[2], self.bounding[1], self.precision);

    var rowBox = geohash.decode_bbox(self.rowHash),
      columnHash = self.rowHash,
      columnBox = rowBox,
      buffer = 0.0002;

    clipper = turf.polygon([[
      [ self.bounding[1] - buffer, rowBox[2] + buffer], // nw
      [ self.bounding[3] + buffer, rowBox[2] + buffer], // ne
      [ self.bounding[3] + buffer, rowBox[0] - buffer], // se
      [ self.bounding[1] - buffer, rowBox[0] - buffer], //sw
      [ self.bounding[1] - buffer, rowBox[2] + buffer] //nw
    ]]);

    turf.intersect(turf.featurecollection([clipper]), turf.featurecollection([poly]), function (err, intersection) {
      if(!intersection || !intersection.features.length) {
        next(rowHashes);
        return
      }
      // console.log(JSON.stringify(intersection));

      while (isWest(columnBox[1], self.bounding[3])) {
        if(inside(geohash.decode(columnHash), intersection)) rowHashes.push(columnHash);
        columnHash = geohash.neighbor(columnHash, [0, 1]);
        columnBox = geohash.decode_bbox(columnHash);
      }

      // get the hash for the next row.
      self.rowHash = geohash.neighbor(self.rowHash, [-1, 0]);

      if(rowBox[2] <= self.bounding[0]) {
        self.geojson.shift();
        self.rowHash = null;
        self.bounding = null;
      }
      // if(rowHashes.length === 0) console.log(JSON.stringify(intersection))
      next(rowHashes);
    });
  };

  if(!this.bounding) {
    turf.extent(turf.featurecollection([poly]), function (err, extent) {
      // [minX, minY, maxX, maxY]
      self.bounding = [extent[1], extent[0], extent[3], extent[2]];
      makeRow();
    })
  } else {
    makeRow();
  }
    
};


/**
 * initializes the Hasher, as a stream
 */
module.exports.stream = function (geoJSONCoords, precision, rowMode) {
  return new Hasher({
    geojson: geoJSONCoords,
    precision: precision,
    rowMode: rowMode ? true : false
  });
};


/**
 * intializes the Hasher, but processes the results before returning an array.
 */
module.exports.sync = function (geoJSONCoords, precision) {
  var hasher = new Hasher({
    geojson: geoJSONCoords,
    precision: precision
  });
  var results = [];

  while(hasher.geojson.length) {
    results = results.concat(hasher.getNextRow());
  }

  return results;
};


/**
 * Convert polygon to bounding box
 * accepts polygon in geojson format (not multipoly): [[[lon, lat]]]
 * returns [minLat, minLon, maxLat, maxLon]
 */
var polyToBB = function (polygon) {
  var minLat = Number.MAX_VALUE, minLon = minLat, maxLat = -minLat, maxLon = -minLat;
  for (var a = 0; a < polygon.length; a++) {
    for (var b = 0; b < polygon[a].length; b++) {
      var p = polygon[a][b];
      minLat = Math.min(minLat, p[1]);
      minLon = Math.min(minLon, p[0]);
      maxLat = Math.max(maxLat, p[1]);
      maxLon = Math.max(maxLon, p[0]);
    }
  }
  return [minLat, minLon, maxLat, maxLon];
}


/**
 * determine if lon1 is west of lon2
 * returns boolean
 **/
var isWest = function (lon1, lon2) {
  return (lon1 < lon2 && lon2 - lon1 < 180) || (lon1 > lon2 && lon2 - lon1 + 360 < 180);
}
