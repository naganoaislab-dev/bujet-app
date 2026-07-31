"use strict";

// Build a single local SVG sprite from the official Heroicons 24px solid set.
// Usage:
// node scripts/build-heroicons-sprite.js <heroicons-solid-directory> <output-file>

const fs = require("fs");
const path = require("path");

const [sourceDirectory, outputFile] = process.argv.slice(2);

if (!sourceDirectory || !outputFile) {
  throw new Error("Usage: node scripts/build-heroicons-sprite.js <source-directory> <output-file>");
}

const files = fs.readdirSync(sourceDirectory)
  .filter((file) => file.endsWith(".svg"))
  .sort((left, right) => left.localeCompare(right));

const symbols = files.map((file) => {
  const name = path.basename(file, ".svg");
  const source = fs.readFileSync(path.join(sourceDirectory, file), "utf8");
  const viewBox = source.match(/viewBox="([^"]+)"/)?.[1] || "0 0 24 24";
  const body = source
    .replace(/^[\s\S]*?<svg\b[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();
  return `  <symbol id="${name}" viewBox="${viewBox}" fill="currentColor">${body}</symbol>`;
});

const sprite = [
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
  "<!-- Heroicons v2.2.0, MIT License. See HEROICONS-LICENSE.txt. -->",
  "<svg xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\" style=\"display:none\">",
  ...symbols,
  "</svg>",
  ""
].join("\n");

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, sprite, "utf8");
console.log(`Wrote ${symbols.length} icons to ${outputFile}`);
