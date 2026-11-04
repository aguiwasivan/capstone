const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "node_modules", "react-zoom-pan-pinch", "dist");
const files = ["index.esm.js", "index.cjs.js"];

for (const file of files) {
  const filePath = path.join(distDir, file);
  if (!fs.existsSync(filePath)) continue;

  const source = fs.readFileSync(filePath, "utf8");
  const nextSource = source.replace(/\n?\/\/# sourceMappingURL=index\.(esm|cjs)\.js\.map\s*$/u, "");

  if (nextSource !== source) {
    fs.writeFileSync(filePath, nextSource, "utf8");
  }
}
