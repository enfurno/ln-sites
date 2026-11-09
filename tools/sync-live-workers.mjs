#!/usr/bin/env node
// Pulls the live production worker scripts for Taste of China and Feast back
// into the repo, so the repo never drifts from what is actually deployed.
//
//   node tools/sync-live-workers.mjs           copy the live files over the repo
//   node tools/sync-live-workers.mjs --check   change nothing, exit 2 if behind
//
// These two sites are not in sites.config.json and are not deployed by the
// deploy workflow: tools/deploylib.mjs never touches sites/toc or sites/feast.
// Their workers were uploaded straight to the Cloudflare API, which is why the
// repo used to hold an older copy. This script is the way back.
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const TARGETS = [
  { worker: "tasteofchina-loadednacho", path: "sites/toc/worker.js" },
  { worker: "feast-loadednacho", path: "sites/feast/worker.js" },
];

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const check = process.argv.includes("--check");

if (!account || !token) {
  console.error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
  process.exit(1);
}

const sha = (b) => createHash("sha256").update(b).digest("hex");

// The content endpoint answers multipart/form-data with the module source as
// the single part named after the entry file.
function extractModule(text) {
  const m = text.match(/--([0-9a-f]{32,})\r\nContent-Disposition: form-data; name="[^"]*"\r\n\r\n/i);
  if (!m) return Buffer.from(text, "utf8");
  const boundary = m[1];
  const start = m.index + m[0].length;
  const end = text.lastIndexOf(`\r\n--${boundary}`);
  if (end < start) throw new Error("malformed multipart body");
  return Buffer.from(text.slice(start, end), "utf8");
}

let drift = 0;
for (const t of TARGETS) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}` +
    `/workers/services/${t.worker}/environments/production/content`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`${t.worker}: HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const live = extractModule(Buffer.from(await res.arrayBuffer()).toString("utf8"));
  const onDisk = existsSync(t.path) ? readFileSync(t.path) : null;
  const same = onDisk !== null && sha(live) === sha(onDisk);
  console.log(
    `${t.path}: live ${live.length}B ${sha(live).slice(0, 12)} | ` +
    `repo ${onDisk ? onDisk.length : 0}B ${onDisk ? sha(onDisk).slice(0, 12) : "missing"} | ` +
    `${same ? "in sync" : "DRIFT"}`
  );
  if (!same) {
    drift += 1;
    if (!check) writeFileSync(t.path, live);
  }
}

if (drift && check) {
  console.error(`\n${drift} file(s) behind the deployed workers.`);
  process.exit(2);
}
if (!drift) console.log("\nRepo matches the deployed workers.");