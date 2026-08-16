import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultSource = "C:\\Users\\Angga Bachtiar\\Documents\\Personal Projects\\codex-cli-runner\\logs";
const source = process.env.CODEX_LOG_DIR || defaultSource;
const files = (await readdir(source)).filter((name) => name.endsWith(".json"));
const logs = [];
for (const file of files) {
  try { logs.push(JSON.parse(await readFile(path.join(source, file), "utf8"))); }
  catch (error) { console.warn(`Skipped ${file}: ${error.message}`); }
}
await mkdir("public", { recursive: true });
await writeFile("public/logs.json", JSON.stringify(logs, null, 2));
console.log(`Synced ${logs.length} logs from ${source}`);
