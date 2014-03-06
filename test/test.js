var hasher = require('../index'),
  should = require('should'),
  ldj = require('ldjson-stream'),
  fs = require('fs'),
  through2 = require('through2'),
  geojsonsFile = 'test/geojsons.ldj';

describe('geohash-poly', function () {

  describe('standard', function () {

    it('should return the expected number of geohashes for shapes.', function (done) {
      fs.createReadStream(geojsonsFile)
        .pipe(ldj.parse())
        .on('data', function(geojson) {
          var self = this;
          self.pause();
          hasher(geojson.geometry.coordinates, geojson.precision, function (err, hashes) {
            should.not.exist(err);
            hashes.length.should.equal(geojson.expected);
            self.resume();
          });
        })
        .on('end', done);
    });
  });

  describe('streaming', function () {

    it('should return the expected number of geohashes and rows for shapes.', function (done) {
      fs.createReadStream(geojsonsFile)
        .pipe(ldj.parse())
        .on('data', function(geojson) {
          var self = this;
          self.pause();
          var rowStream = hasher.stream(geojson.geometry.coordinates, geojson.precision, true),
            hashCount = 0,
            rowCount = 0;
          rowStream
            .on('end', function () {
              hashCount.should.equal(geojson.expected);
              rowCount.should.equal(geojson.rows);
              self.resume();
            })
            .pipe(through2.obj(function (hashes, enc, callback) {
              hashCount += hashes.length;
              rowCount += 1;
              callback();
            }));
        })
        .on('end', done);
    });
  });
});
