// scripts/dtcg-to-figma.mjs
// Reads DTCG JSON (output of `designmd export --format dtcg`) and emits
// a flat Figma-Variables-friendly payload that the import plugin consumes.
//
// Usage:
//   node scripts/dtcg-to-figma.mjs tokens.json figma-payload.json

import fs from "node:fs";

const [, , inputPath = "tokens.json", outputPath = "figma-payload.json"] =
  process.argv;

const REM_BASE = 16; // 1rem = 16px

const dtcg = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const variables = [];
const seen = new Set();

function hexToRgba(hex) {
  const h = String(hex).replace("#", "").trim();
  if (![3, 4, 6, 8].includes(h.length)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  // Expand 3/4-digit shorthand
  const expanded = h.length <= 4
    ? h.split("").map((c) => c + c).join("")
    : h;
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const a = expanded.length === 8
    ? parseInt(expanded.slice(6, 8), 16) / 255
    : 1;
  return { r, g, b, a };
}

function dimensionToNumber(value) {
  if (typeof value === "number") return value;
  const s = String(value).trim();
  const m = s.match(/^(-?\d*\.?\d+)\s*(px|rem|em)?$/i);
  if (!m) {
    throw new Error(`Invalid dimension: ${value}`);
  }
  const num = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  if (unit === "rem" || unit === "em") return num * REM_BASE;
  return num;
}

function isReference(value) {
  return typeof value === "string"
    && value.startsWith("{")
    && value.endsWith("}");
}

function refToName(ref) {
  // {colors.primary} -> "colors/primary"
  return ref.slice(1, -1).trim().replaceAll(".", "/");
}

function emit(name, type, value) {
  if (seen.has(name)) {
    console.warn(`⚠ Duplicate token name skipped: ${name}`);
    return;
  }
  seen.add(name);
  variables.push({ name, type, value });
}

function processColor(name, raw) {
  if (isReference(raw)) {
    emit(name, "COLOR", { alias: refToName(raw) });
  } else {
    emit(name, "COLOR", { color: hexToRgba(raw) });
  }
}

function processDimension(name, raw) {
  if (isReference(raw)) {
    emit(name, "FLOAT", { alias: refToName(raw) });
  } else {
    emit(name, "FLOAT", { number: dimensionToNumber(raw) });
  }
}

function processString(name, raw) {
  if (isReference(raw)) {
    emit(name, "STRING", { alias: refToName(raw) });
  } else {
    emit(name, "STRING", { string: String(raw) });
  }
}

function processFontWeight(name, raw) {
  // Accept numeric weights (400, 700) as FLOAT, named weights as STRING.
  if (isReference(raw)) {
    // Can't know target type at this stage — default to STRING alias.
    emit(name, "STRING", { alias: refToName(raw) });
    return;
  }
  if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
    emit(name, "FLOAT", { number: Number(raw) });
  } else {
    emit(name, "STRING", { string: String(raw) });
  }
}

function processTypographyComposite(basePath, value) {
  // DTCG typography composite -> decompose to individual variables.
  // Figma Variables can't hold a composite typography token directly.
  const map = {
    fontFamily: processString,
    fontSize: processDimension,
    fontWeight: processFontWeight,
    lineHeight: (n, v) =>
      typeof v === "number" || /^-?\d*\.?\d+$/.test(String(v))
        ? processDimension(n, v) // unitless line-height becomes FLOAT
        : processDimension(n, v),
    letterSpacing: processDimension,
  };
  for (const [key, handler] of Object.entries(map)) {
    if (value[key] !== undefined) {
      handler(`${basePath}/${key}`, value[key]);
    }
  }
}

function walk(node, path = []) {
  if (!node || typeof node !== "object") return;

  // Leaf: DTCG token
  if (node.$value !== undefined && node.$type !== undefined) {
    const name = path.join("/");
    const type = node.$type;
    const val = node.$value;

    switch (type) {
      case "color":
        processColor(name, val);
        break;
      case "dimension":
      case "number":
        processDimension(name, val);
        break;
      case "fontWeight":
        processFontWeight(name, val);
        break;
      case "fontFamily":
      case "string":
        processString(name, val);
        break;
      case "typography":
        if (typeof val === "object" && val !== null) {
          processTypographyComposite(name, val);
        }
        break;
      default:
        // Unknown type — best-effort string fallback
        processString(name, val);
    }
    return;
  }

  // Group node — recurse into children, skipping DTCG meta keys
  for (const key of Object.keys(node)) {
    if (key.startsWith("$")) continue;
    walk(node[key], [...path, key]);
  }
}

walk(dtcg);

// Validate alias targets exist (warn only — plugin will skip unresolved aliases)
const allNames = new Set(variables.map((v) => v.name));
for (const v of variables) {
  if (v.value.alias && !allNames.has(v.value.alias)) {
    console.warn(
      `⚠ Unresolved alias: ${v.name} -> {${v.value.alias.replaceAll("/", ".")}}`,
    );
  }
}

const output = {
  generated: new Date().toISOString(),
  collection: process.env.FIGMA_COLLECTION_NAME || "Brand",
  mode: process.env.FIGMA_MODE_NAME || "Default",
  variables,
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(
  `✅ ${variables.length} variables written to ${outputPath} (collection: "${output.collection}")`,
);
