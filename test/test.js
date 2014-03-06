var hasher = require('../index'),
  should = require('should'),
  ldj = require('ldjson-stream'),
  fs = require('fs'),
  through2 = require('through2'),
  polys = [];

before(function (done) {
  fs.createReadStream('test/geojsons.ldj')
    .pipe(ldj.parse())
    .on('data', function(obj) {
      polys.push(obj);
    })
    .on('end', done);
});

describe('geohash-poly', function () {

  describe('standard', function () {

    it('should return the expected number of geohashes.', function (done) {
      hasher(polys[0].coordinates, 7, function (err, hashes) {
        should.not.exist(err);
        hashes.length.should.equal(polys[0].expected);
        done();
      });
    });

  });

  describe('streaming', function () {

    it('should return the expected number of geohashes and rows.', function (done) {
      var rowStream = hasher.stream(polys[0].coordinates, 7, true),
        hashCount = 0,
        rowCount = 0;
      rowStream
        .on('end', function () {
          hashCount.should.equal(polys[0].expected);
          rowCount.should.equal(polys[0].rows);
          done();
        })
        .pipe(through2.obj(function (hashes, enc, callback) {
          hashCount += hashes.length;
          rowCount += 1;
          callback();
        }));
    });

  });

});
