if (process.argv.length > 2 && process.argv[2] === "1") {
  async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async function run() {
    for (var i = 0; i < 5; i++) {
      await wait(200);
      console.log(i);
    }
    console.log("disconnect server");
    await wait(5000);
    for (var i = 5; i < 10; i++) {
      await wait(200);
      console.log(i);
    }
  }
  run();
} else {
  for (var i = 0; i < 10; i++) {
    console.log(i);
  }
}
