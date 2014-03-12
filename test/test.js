var hasher = require('../index'),
  should = require('should'),
  ldj = require('ldjson-stream'),
  fs = require('fs'),
  through2 = require('through2'),
  async = require('async'),
  geojsonsFile = 'test/geojsons.ldj';

require('joe').describe('geohash-poly', function (describe, it) {

  describe('standard', function (describe, it, suiteDone) {

    fs.createReadStream(geojsonsFile)
      .pipe(ldj.parse())
      .on('data', function(geojson) {
        var self = this;
        self.pause();

        async.timesSeries(geojson.properties.maxPrecision, function (n, next) {
          var precision = n + 1;
          it('should geohash ' + geojson.properties.comment + ' shape. Precision ' + precision + '.', function (done) {
            hasher(geojson.geometry.coordinates, precision, function (err, hashes) {
              should.not.exist(err);
              hashes.length.should.equal(geojson.properties.expected[n]);
              done();
            });
          });
          next();
        }, function (err) {
          self.resume();
        });

      })
      .on('end', suiteDone);
    });

  describe('streaming', function (describe, it, suiteDone) {

    fs.createReadStream(geojsonsFile)
      .pipe(ldj.parse())
      .on('data', function(geojson) {
        var self = this;
        self.pause();

        async.timesSeries(geojson.properties.maxPrecision, function (n, next) {
          var precision = n + 1;
          it('should geohash ' + geojson.properties.comment + ' shape. Precision ' + precision + '.', function (done) {
            var rowStream = hasher.stream(geojson.geometry.coordinates, precision, true),
              hashCount = 0,
              rowCount = 0;
            rowStream
              .on('end', function () {
                hashCount.should.equal(geojson.properties.expected[n]);
                rowCount.should.equal(geojson.properties.rows[n]);
                done();
              })
              .pipe(through2.obj(function (hashes, enc, callback) {
                hashCount += hashes.length;
                rowCount += 1;
                callback();
              }));
          });
          next();
        }, function (err) {
          self.resume();
        });
        

      })
      .on('end', suiteDone);
  });
});
