const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("installed app calls the native scanner without a browser prompt", () => {
  const source = fs.readFileSync("www/app.js", "utf8");
  assert.match(source, /if \(nativePlugin\) return nativePlugin\.scanQr\(\)/);
  assert.doesNotMatch(source, /prompt\s*\(/);
  assert.doesNotMatch(source, /브라우저 미리보기입니다/);
});

test("Android manifest exposes the embedded camera scanner", () => {
  const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android:name="\.ScannerActivity"/);
});
