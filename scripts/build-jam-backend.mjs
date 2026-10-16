import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sheetId = process.argv[2];
if (!sheetId || !/^[A-Za-z0-9_-]{20,120}$/.test(sheetId)) throw new Error("Pass the existing private RSVP spreadsheet ID.");
const songs = JSON.parse(await readFile(path.join(root, "src/jam/songs.json"), "utf8"));
const backend = await readFile(path.join(root, "google-apps-script/jam/Code.gs"), "utf8");
const directory = path.join(root, "private/jam-deployment");
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "Code.gs"), `const JAM_DATABASE_ID = ${JSON.stringify(sheetId)};\nconst JAM_SONG_SEED = ${JSON.stringify(songs)};\n\n${backend}`);
console.log(`Prepared complete Apps Script source with ${songs.length} songs at private/jam-deployment/Code.gs`);
