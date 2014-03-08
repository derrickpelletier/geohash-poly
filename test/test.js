var hasher = require('../index'),
  should = require('should'),
  ldj = require('ldjson-stream'),
  fs = require('fs'),
  through2 = require('through2'),
  geojsonsFile = 'test/geojsons.ldj';

require('joe').describe('geohash-poly', function (describe, it) {

  describe('standard', function (describe, it, suiteDone) {

    fs.createReadStream(geojsonsFile)
      .pipe(ldj.parse())
      .on('data', function(geojson) {
        var self = this;

        it('should return the expected number of geohashes for ' + geojson.comment + ' shape.', function (done) {
          self.pause();
          hasher(geojson.geometry.coordinates, geojson.precision, function (err, hashes) {
            should.not.exist(err);
            hashes.length.should.equal(geojson.expected);
            done();
            self.resume();
          });
        });

      })
      .on('end', suiteDone);
    });

  describe('streaming', function (describe, it, suiteDone) {

    fs.createReadStream(geojsonsFile)
      .pipe(ldj.parse())
      .on('data', function(geojson) {
        var self = this;

        it('should return the expected number of geohashes and rows for ' + geojson.comment + ' shape.', function (done) {
          self.pause();
          var rowStream = hasher.stream(geojson.geometry.coordinates, geojson.precision, true),
            hashCount = 0,
            rowCount = 0;
          rowStream
            .on('end', function () {
              hashCount.should.equal(geojson.expected);
              rowCount.should.equal(geojson.rows);
              done();
              self.resume();
            })
            .pipe(through2.obj(function (hashes, enc, callback) {
              hashCount += hashes.length;
              rowCount += 1;
              callback();
            }));
        });

      })
      .on('end', suiteDone);
  });
});
