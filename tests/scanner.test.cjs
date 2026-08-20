const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("installed app calls the explicit Android bridge without a browser prompt", () => {
  const source = fs.readFileSync("www/app.js", "utf8");
  assert.match(source, /globalThis\.TimeMoneyNative/);
  assert.match(source, /bridge\.scanQr\(\)/);
  assert.match(source, /__timeMoneyNativeScanResult/);
  assert.doesNotMatch(source, /registerPlugin\("Commute"\)/);
  assert.doesNotMatch(source, /prompt\s*\(/);
  assert.doesNotMatch(source, /QR 스캔은 설치된 Android 앱에서/);
});

test("Android uses the same Google code scanner pattern as the working reference app", () => {
  const activity = fs.readFileSync("android/app/src/main/java/com/mycommute/app/MainActivity.java", "utf8");
  const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
  const gradle = fs.readFileSync("android/app/build.gradle", "utf8");
  assert.match(activity, /GmsBarcodeScanning\.getClient/);
  assert.match(activity, /qrScanner\.startScan\(\)/);
  assert.match(activity, /addJavascriptInterface/);
  assert.match(gradle, /play-services-code-scanner:16\.1\.0/);
  assert.match(manifest, /com\.google\.mlkit\.vision\.DEPENDENCIES/);
  assert.doesNotMatch(manifest, /ScannerActivity/);
});
