const gulp = require("gulp");
const mkdirp = require("mkdirp");

gulp.task("default", async () => {
  mkdirp.sync("dist");
});
