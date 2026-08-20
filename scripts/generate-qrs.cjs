const fs = require("node:fs");
const path = require("node:path");
const QRCode = require("qrcode");

const codes = [
  { file: "checkin", value: "MYCOMMUTE:CHECKIN:v1:LAB", color: "#177760" },
  { file: "checkout", value: "MYCOMMUTE:CHECKOUT:v1:LAB", color: "#df6548" },
  { file: "gym", value: "MYCOMMUTE:GYM:v1:LAB", color: "#4d67d8" }
];

async function main() {
  const webDir = path.join(__dirname, "..", "www", "qrs");
  const outputDir = path.join(__dirname, "..", "qr-codes");
  fs.mkdirSync(webDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  for (const code of codes) {
    const options = {
      errorCorrectionLevel: "H",
      margin: 3,
      width: 1000,
      color: { dark: code.color, light: "#ffffffff" }
    };
    await QRCode.toFile(path.join(webDir, `${code.file}.png`), code.value, options);
    await QRCode.toFile(path.join(outputDir, `${code.file}.png`), code.value, options);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
