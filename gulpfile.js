const gulp = require("gulp");
const mkdirp = require("mkdirp");
const { compile } = require("nexe");

gulp.task("default", async () => {
  mkdirp.sync("dist");

  compile({
    input: "./index.js",
    output: "dist/forward-logs",
    enableStdIn: false
  }).then(() => {
    console.log("success");
  });
});
