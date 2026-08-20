const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("exception choices start unselected and reset whenever the dialog opens", () => {
  const html = fs.readFileSync("www/index.html", "utf8");
  const source = fs.readFileSync("www/app.js", "utf8");
  const choices = [...html.matchAll(/<input name="exception-type"[^>]+>/g)].map((match) => match[0]);

  assert.equal(choices.length, 2);
  assert.ok(choices.every((choice) => !/\schecked(?:\s|\/|>)/.test(choice)));
  assert.match(source, /input\.checked = false/);
});
