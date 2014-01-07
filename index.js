var geohash = require('ngeohash'),
  pip = require('point-in-polygon');


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
module.exports = function (geoJSONCoords, precision) {
  var hashList = [];
  var isMulti = Array.isArray(geoJSONCoords[0][0][0]);
  if(!isMulti) geoJSONCoords = [geoJSONCoords];

  for(var i = 0; i < geoJSONCoords.length; i++) {
    hashList = hashList.concat(hashesInPoly(geoJSONCoords[i], precision));
  }

  if(isMulti) {
    hashList = hashList.filter(function (elem, pos, arr) {
      return arr.indexOf(elem) === pos;
    });
  }

  return hashList;
};


/**
 * get all the hashes for a given polygon
 * accepts polygon in geojson format (not multipoly): [[[lon, lat]]]
 *
 * note: hashes are considered "inside" if the center point of the hash falls within the polygon.
 * this does not create 100% coverage.
 *
 * returns array of hashes that make up the polygon, holes accounted for.
 */
var hashesInPoly = function (polygonPoints, precision) {
  var bounding = polyToBB(polygonPoints),
    allHashes = [],
    rowHash = geohash.encode(bounding[2], bounding[1], precision),
    rowBox = geohash.decode_bbox(rowHash);

  do {
    var columnHash = rowHash,
      columnBox = rowBox;
    while (isWest(columnBox[1], bounding[3])) {
      if(inside(geohash.decode(columnHash), polygonPoints)) {
        allHashes.push(columnHash);
      }
      columnHash = geohash.neighbor(columnHash, [0, 1]);
      columnBox = geohash.decode_bbox(columnHash);
    }
    rowHash = geohash.neighbor(rowHash, [-1, 0]);
    rowBox = geohash.decode_bbox(rowHash);
  
  } while (rowBox[2] > bounding[0]);

  return allHashes;
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
