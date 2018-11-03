const gulp = require("gulp");
const mkdirp = require("mkdirp");

gulp.task("default", async () => {
  mkdirp.sync("dist/linux-x64");
  mkdirp.sync("dist/windows-x64");
  mkdirp.sync("dist/alpine-x64");
});
