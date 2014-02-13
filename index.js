var Readable = require('stream').Readable,
  geohash = require('ngeohash'),
  pip = require('point-in-polygon'),
  util = require('util');


/**
 * utilizing point-in-poly but providing support for geojson polys and holes.
 */
var inside = function (point, geopoly) {
  var inside = 0;
  for(var i = 0; i < geopoly.length; i++) {
    inside += pip([point.longitude, point.latitude], geopoly[i]) ? 1 : 0
  }
  return inside % 2;
}


/*
 * Calculate geohashes of specified precision that cover the (Multi)Polygon provided
 * returns array of hashes with no duplicates
 */
var Hasher = function (geoJSONCoords, precision) {
  this.isMulti = Array.isArray(geoJSONCoords[0][0][0]);
  this.geojson = !this.isMulti ? [geoJSONCoords] : geoJSONCoords;
  this.precision = precision;
  this.hashes = [];
  Readable.call(this);

  for(var i = 0; i < this.geojson.length; i++) {
    this.hashesInPoly(this.geojson[i], this.precision);
  }

  // done, trigger stream end.
  this.addAnother(null)
}

util.inherits(Hasher, Readable);
var stuff_to_push = ['pizza', 'whatever', 'sauce', 'burgers', 'yep', null];


/**
 * adds a hash or set of hashes to the stream buffer.
 * emits readable to tell the stream there is more available.
 */
Hasher.prototype.addAnother = function (hashes) {
  var self = this;
  if(!Array.isArray(hashes)) hashes = [hashes];
  self.hashes = self.hashes.concat(hashes);
  self.emit('readable');
}

Hasher.prototype._read = function (size) {
  if(!this.hashes.length) return this.push('');

  while(this.hashes.length) {
    this.push(this.hashes.shift());
  }
}


/**
 * get all the hashes for a given polygon
 * accepts polygon in geojson format (not multipoly): [[[lon, lat]]]
 *
 * note: hashes are considered "inside" if the center point of the hash falls within the polygon.
 * this does not create 100% coverage.
 *
 * returns array of hashes that make up the polygon, holes accounted for.
 */
Hasher.prototype.hashesInPoly = function (polygonPoints, precision) {
  var self = this,
    bounding = polyToBB(polygonPoints),
    allHashes = [],
    rowHash = geohash.encode(bounding[2], bounding[1], precision),
    rowBox = geohash.decode_bbox(rowHash);

  do {
    var columnHash = rowHash,
      columnBox = rowBox;
    while (isWest(columnBox[1], bounding[3])) {
      if(inside(geohash.decode(columnHash), polygonPoints)) {
        self.addAnother(columnHash);
      }
      columnHash = geohash.neighbor(columnHash, [0, 1]);
      columnBox = geohash.decode_bbox(columnHash);
    }
    rowHash = geohash.neighbor(rowHash, [-1, 0]);
    rowBox = geohash.decode_bbox(rowHash);
  
  } while (rowBox[2] > bounding[0]);
}

module.exports.stream = function (geoJSONCoords, precision) {
  var hasher = new Hasher(geoJSONCoords, precision);
  return hasher;
}


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
