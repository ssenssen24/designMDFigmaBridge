// figma-plugin/code.ts (v2.1)
//
// DESIGN.md Importer — manifest-based multi-select import.
// Fixes from v2.0:
//   - Use figma.notify() for errors (always visible, even if log scrolls off)
//   - Fix msg.url vs msg.manifestUrl mismatch
//   - Compact UI that fits in default plugin window
//   - Auto-collapse settings after successful load

interface PayloadValue {
  color?: { r: number; g: number; b: number; a: number };
  number?: number;
  string?: string;
  alias?: string;
}

interface PayloadVariable {
  name: string;
  type: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  value: PayloadValue;
}

interface Payload {
  generated: string;
  collection: string;
  mode: string;
  variables: PayloadVariable[];
}

interface ManifestEntry {
  name: string;
  url: string;
  kind: "brand" | "promotion";
}

const STORAGE_MANIFEST_URL = "design-md.manifest-url";

figma.showUI(__html__, { width: 400, height: 500, themeColors: true });

(async () => {
  const url = (await figma.clientStorage.getAsync(STORAGE_MANIFEST_URL)) || "";
  figma.ui.postMessage({ type: "init", manifestUrl: url });
  if (url) {
    try {
      await loadManifest(url);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      figma.notify(`❌ Auto-load failed: ${m}`, { error: true, timeout: 8000 });
      figma.ui.postMessage({ type: "log", message: `❌ ${m}` });
      figma.ui.postMessage({ type: "open-settings" });
    }
  } else {
    figma.ui.postMessage({ type: "open-settings" });
  }
})();

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "set-manifest") {
      await figma.clientStorage.setAsync(STORAGE_MANIFEST_URL, msg.url);
      await loadManifest(msg.url);
    } else if (msg.type === "import") {
      await importMany(msg.entries);
    } else if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    figma.ui.postMessage({ type: "log", message: `❌ ${m}` });
    figma.notify(`❌ ${m}`, { error: true, timeout: 8000 });
    figma.ui.postMessage({ type: "done" });
  }
};

async function loadManifest(url: string) {
  figma.ui.postMessage({ type: "log", message: `📥 Loading manifest…` });

  let res: { ok: boolean; status: number; json(): Promise<unknown> };
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error: ${m}. Check the URL and network access.`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from manifest URL`);
  }

  let entries: ManifestEntry[];
  try {
    entries = (await res.json()) as ManifestEntry[];
  } catch {
    throw new Error("Manifest is not valid JSON");
  }

  if (!Array.isArray(entries)) {
    throw new Error("Manifest must be a JSON array");
  }

  if (entries.length === 0) {
    figma.notify("⚠ Manifest is empty (0 collections)", { timeout: 5000 });
  }

  // Sort: brands first, then promotions, both by name.
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "brand" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const existingNames = new Set(
    figma.variables.getLocalVariableCollections().map((c) => c.name),
  );
  const annotated = entries.map((e) => ({
    ...e,
    existsLocally: existingNames.has(e.name),
  }));

  figma.ui.postMessage({ type: "manifest-loaded", entries: annotated });
  figma.ui.postMessage({
    type: "log",
    message: `📋 Loaded ${entries.length} collection(s).`,
  });
  figma.notify(`📋 ${entries.length} collection(s) ready`, { timeout: 3000 });
}

async function importMany(entries: ManifestEntry[]) {
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const entry of entries) {
    figma.ui.postMessage({
      type: "log",
      message: `📦 ${entry.name}…`,
    });

    let payload: Payload;
    try {
      const res = await fetch(entry.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = (await res.json()) as Payload;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      figma.ui.postMessage({
        type: "log",
        message: `  ❌ ${entry.name}: ${m}`,
      });
      continue;
    }

    const result = importPayload(payload);
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
    figma.ui.postMessage({
      type: "log",
      message: `  ✅ +${result.created}, ~${result.updated}, skip ${result.skipped}`,
    });
  }

  const summary =
    `Done. +${totalCreated} new, ~${totalUpdated} updated, ` +
    `${totalSkipped} skipped across ${entries.length} collection(s).`;
  figma.ui.postMessage({ type: "log", message: `🎉 ${summary}` });
  figma.notify(`✅ Imported ${totalCreated + totalUpdated} variables`, {
    timeout: 4000,
  });
  figma.ui.postMessage({ type: "done" });
}

function importPayload(payload: Payload) {
  const collections = figma.variables.getLocalVariableCollections();
  let collection = collections.find((c) => c.name === payload.collection);
  if (!collection) {
    collection = figma.variables.createVariableCollection(payload.collection);
  }

  const modeId = collection.modes[0].modeId;
  if (collection.modes[0].name !== payload.mode) {
    collection.renameMode(modeId, payload.mode);
  }

  const allVars = figma.variables.getLocalVariables();
  const byName = new Map<string, Variable>();
  for (const v of allVars) {
    if (v.variableCollectionId === collection.id) byName.set(v.name, v);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const def of payload.variables) {
    const existing = byName.get(def.name);
    if (!existing) {
      const v = figma.variables.createVariable(def.name, collection, def.type);
      byName.set(def.name, v);
      created++;
    } else if (existing.resolvedType !== def.type) {
      figma.ui.postMessage({
        type: "log",
        message: `  ⚠ "${def.name}": ${existing.resolvedType} ≠ ${def.type}`,
      });
      skipped++;
    } else {
      updated++;
    }
  }

  for (const def of payload.variables) {
    const v = byName.get(def.name);
    if (!v || v.resolvedType !== def.type) continue;

    try {
      if (def.value.alias !== undefined) {
        const target = byName.get(def.value.alias);
        if (!target) continue;
        if (target.resolvedType !== v.resolvedType) continue;
        v.setValueForMode(modeId, figma.variables.createVariableAlias(target));
      } else if (def.value.color !== undefined) {
        v.setValueForMode(modeId, def.value.color);
      } else if (def.value.number !== undefined) {
        v.setValueForMode(modeId, def.value.number);
      } else if (def.value.string !== undefined) {
        v.setValueForMode(modeId, def.value.string);
      }
    } catch {
      // Silent skip — non-fatal per-variable errors
    }
  }

  return { created, updated, skipped };
}
