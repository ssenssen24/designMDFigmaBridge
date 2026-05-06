// scripts/dtcg-to-figma.mjs
//
// Converts DTCG JSON (output of `@google/design.md export --format dtcg`)
// into a flat Figma-Variables-friendly payload consumed by the import plugin.
//
// Spec compliance: W3C DTCG 2025.10 schema, including:
//   - $type inheritance from parent groups
//   - color objects: { colorSpace, components: [r,g,b], alpha?, hex? }
//   - dimension objects: { value: number, unit: "px"|"rem"|"em" }
//   - typography composite: decomposed into 5 individual variables
//
// Note: design.md's `components` section is NOT exported by the CLI's
// `--format dtcg` output (it's a design.md-specific abstraction outside
// the DTCG standard). Component tokens stay in DESIGN.md for use by code
// generators / Tailwind export, but won't appear in Figma Variables.
//
// Usage:
//   node scripts/dtcg-to-figma.mjs tokens.json figma-payload.json

import fs from "node:fs";

const [, , inputPath = "tokens.json", outputPath = "figma-payload.json"] =
  process.argv;

const REM_BASE = 16;

const dtcg = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const variables = [];
const seen = new Set();

function emit(name, type, value) {
  if (seen.has(name)) {
    console.warn(`⚠ Duplicate token name skipped: ${name}`);
    return;
  }
  seen.add(name);
  variables.push({ name, type, value });
}

function isReference(value) {
  return typeof value === "string" && /^\{[^}]+\}$/.test(value);
}

function refToName(ref) {
  return ref.slice(1, -1).trim().replaceAll(".", "/");
}

// DTCG dimension: { value, unit } | number | string ("16px")
function dimensionToNumber(value) {
  if (typeof value === "number") return value;
  if (value !== null && typeof value === "object" && "value" in value) {
    const num = Number(value.value);
    if (Number.isNaN(num)) {
      throw new Error(`Invalid dimension: ${JSON.stringify(value)}`);
    }
    const unit = String(value.unit || "px").toLowerCase();
    return unit === "rem" || unit === "em" ? num * REM_BASE : num;
  }
  const m = String(value).trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em)?$/i);
  if (!m) throw new Error(`Invalid dimension: ${JSON.stringify(value)}`);
  const num = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  return unit === "rem" || unit === "em" ? num * REM_BASE : num;
}

// DTCG color: { colorSpace, components: [r,g,b], alpha?, hex? } | hex string
function colorToRgba(value) {
  if (typeof value === "string") return hexStringToRgba(value);
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value.components) && value.components.length >= 3) {
      const [r, g, b] = value.components;
      const a = value.alpha != null ? Number(value.alpha) : 1;
      return { r: Number(r), g: Number(g), b: Number(b), a };
    }
    if (typeof value.hex === "string") return hexStringToRgba(value.hex);
  }
  throw new Error(`Invalid color: ${JSON.stringify(value)}`);
}

function hexStringToRgba(hex) {
  const h = String(hex).replace("#", "").trim();
  const expanded = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
  if (![6, 8].includes(expanded.length)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16) / 255,
    g: parseInt(expanded.slice(2, 4), 16) / 255,
    b: parseInt(expanded.slice(4, 6), 16) / 255,
    a: expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

// ------- per-type processors -------

function processColor(name, raw) {
  if (isReference(raw)) emit(name, "COLOR", { alias: refToName(raw) });
  else emit(name, "COLOR", { color: colorToRgba(raw) });
}

function processDimension(name, raw) {
  if (isReference(raw)) emit(name, "FLOAT", { alias: refToName(raw) });
  else emit(name, "FLOAT", { number: dimensionToNumber(raw) });
}

function processString(name, raw) {
  if (isReference(raw)) emit(name, "STRING", { alias: refToName(raw) });
  else emit(name, "STRING", { string: String(raw) });
}

function processNumber(name, raw) {
  if (isReference(raw)) emit(name, "FLOAT", { alias: refToName(raw) });
  else emit(name, "FLOAT", { number: Number(raw) });
}

function processFontWeight(name, raw) {
  if (isReference(raw)) {
    emit(name, "STRING", { alias: refToName(raw) });
  } else if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
    emit(name, "FLOAT", { number: Number(raw) });
  } else {
    emit(name, "STRING", { string: String(raw) });
  }
}

// Typography composite — Figma can't store as one variable, so decompose.
function processTypographyComposite(basePath, value) {
  if (value.fontFamily !== undefined) {
    processString(`${basePath}/fontFamily`, value.fontFamily);
  }
  if (value.fontSize !== undefined) {
    processDimension(`${basePath}/fontSize`, value.fontSize);
  }
  if (value.fontWeight !== undefined) {
    processFontWeight(`${basePath}/fontWeight`, value.fontWeight);
  }
  if (value.lineHeight !== undefined) {
    const lh = value.lineHeight;
    if (typeof lh === "number") {
      processNumber(`${basePath}/lineHeight`, lh);
    } else {
      processDimension(`${basePath}/lineHeight`, lh);
    }
  }
  if (value.letterSpacing !== undefined) {
    processDimension(`${basePath}/letterSpacing`, value.letterSpacing);
  }
}

function processToken(name, type, value) {
  switch (type) {
    case "color":
      processColor(name, value);
      break;
    case "dimension":
      processDimension(name, value);
      break;
    case "number":
      processNumber(name, value);
      break;
    case "fontWeight":
      processFontWeight(name, value);
      break;
    case "fontFamily":
    case "string":
    case "duration":
    case "cubicBezier":
      processString(name, value);
      break;
    case "typography":
      if (value !== null && typeof value === "object") {
        processTypographyComposite(name, value);
      }
      break;
    default:
      console.warn(`⚠ Unknown token type "${type}" at ${name} — using string fallback`);
      processString(name, value);
  }
}

// Walk the tree, inheriting $type from parent groups (DTCG behavior).
function walk(node, path = [], inheritedType = null) {
  if (!node || typeof node !== "object") return;

  // Leaf token: has $value
  if ("$value" in node) {
    const type = node.$type || inheritedType;
    if (!type) {
      console.warn(`⚠ Token at "${path.join("/")}" has no $type — skipped`);
      return;
    }
    processToken(path.join("/"), type, node.$value);
    return;
  }

  // Group: pass its $type down to children
  const groupType = node.$type || inheritedType;
  for (const key of Object.keys(node)) {
    if (key.startsWith("$")) continue;
    walk(node[key], [...path, key], groupType);
  }
}

walk(dtcg);

// Validate aliases
const allNames = new Set(variables.map((v) => v.name));
let unresolved = 0;
for (const v of variables) {
  if (v.value.alias && !allNames.has(v.value.alias)) {
    console.warn(`⚠ Unresolved alias: ${v.name} → ${v.value.alias}`);
    unresolved++;
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
  `✅ ${variables.length} variables written to ${outputPath}` +
    ` (collection: "${output.collection}"` +
    (unresolved ? `, ${unresolved} unresolved aliases` : "") +
    `)`,
);
