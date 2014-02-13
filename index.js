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
 * Hasher, extends Readable
 * a stream that will provide a readable list of hashes, row by row.
 *
 * Calculate geohashes of specified precision that cover the (Multi)Polygon provided
 * Note, duplicates may occur.
 */
var Hasher = function (geoJSONCoords, precision) {
  this.isMulti = Array.isArray(geoJSONCoords[0][0][0]);
  this.geojson = !this.isMulti ? [geoJSONCoords] : geoJSONCoords;
  this.precision = precision;
  Readable.call(this);
}
util.inherits(Hasher, Readable);


/**
 * _read(), for Readable
 * gets the next row of hashes, can technically be large, but still throttles processing effectively
 * pushes each hash to the buffer individually
 * if there are no polygons remaining in the geojson, push null to end stream
 */
Hasher.prototype._read = function (size) {
  if(!this.geojson.length) return this.push(null);

  var hashes = this.getNextRow();

  if(!hashes.length) return this.push('');
  while(hashes.length) {
    this.push(hashes.shift());
  }

};


/**
 * getNextRow()
 * will get the next row of geohashes for the current index-0 polygon in the list.
 * rowHash persists so that it is available on the next iteration while the poly is still the same
 */
Hasher.prototype.getNextRow = function () {
  var poly = this.geojson[0],
    bounding = polyToBB(poly),
    rowHashes = [];

  if(!this.rowHash) this.rowHash = geohash.encode(bounding[2], bounding[1], this.precision);

  var rowBox = geohash.decode_bbox(this.rowHash),
    columnHash = this.rowHash,
    columnBox = rowBox;
 
  while (isWest(columnBox[1], bounding[3])) {
    if(inside(geohash.decode(columnHash), poly)) rowHashes.push(columnHash);

    columnHash = geohash.neighbor(columnHash, [0, 1]);
    columnBox = geohash.decode_bbox(columnHash);
  }
  
  // get the hash for the next row.
  this.rowHash = geohash.neighbor(this.rowHash, [-1, 0]);

  if(rowBox[2] <= bounding[0]) {
    this.geojson.shift();
    this.rowHash = null;
  }

  return rowHashes;
};


/**
 * initializes the Hasher, as a stream
 */
module.exports.stream = function (geoJSONCoords, precision) {
  return new Hasher(geoJSONCoords, precision);
};


/**
 * intializes the Hasher, but processes the results before returning an array.
 * TODO: make this actually work
 */
module.exports.sync = function (geoJSONCoords, precision) {
  var hasher = new Hasher(geoJSONCoords, precision);
  var results = [];
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
