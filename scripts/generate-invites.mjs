import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PRIVATE_DIR = path.join(ROOT, "private", "google-sheet-seed");
const DEFAULT_CSV = "C:/Users/er1c_/Downloads/contacts.csv";
const DEFAULT_VCF = "C:/Users/er1c_/Downloads/Phone Link/Sunyoung Contacts.vcf";
const SITE_URL = process.env.SITE_URL || "https://YOUR-GITHUB-USERNAME.github.io/wedding-party-rsvp/";

const households = [
  "Sunyoung/Eric",
  "Seijin/Sia",
  "Paula/Bruce",
  "Lindsay/Jeremy",
  "Joyce/Ross",
  "Heather/Jonathan",
  "Alayna",
  "Chantel",
  "Susan/Norman",
  "Julie",
  "Sarah",
  "Jill/David",
  "Eugene",
  "Yunmi",
  "Kelly/Brad",
  "Zuzu/Adam",
  "Nicole/Mike",
  "Kat/Mark",
  "Erin/Neil",
  "Malin",
  "Mike",
  "Trevor/Luxe",
  "Sarah/Jon",
  "Celia/Matt",
  "Roxanne",
  "Joanne/Paul",
  "Terra",
  "Heran",
];

main();

function main() {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  const existingTokens = readExistingTokens();
  const contacts = [
    ...readCsvContacts(process.env.CONTACTS_CSV || DEFAULT_CSV),
    ...readVcfContacts(process.env.CONTACTS_VCF || DEFAULT_VCF),
  ];

  const inviteRows = [];
  const contactRows = [];
  const linkRows = [];

  for (const householdText of households) {
    const names = householdText.split("/").map((name) => name.trim()).filter(Boolean);
    const householdId = slugify(names.join("-"));
    const token = existingTokens.get(householdId) || crypto.randomBytes(18).toString("base64url");
    const householdLabel = names.join(" & ");
    const [primaryName, partnerName = ""] = names;

    inviteRows.push({
      householdId,
      householdLabel,
      primaryName,
      partnerName,
      inviteToken: token,
      contactStatus: "needs contact",
    });

    linkRows.push({
      householdLabel,
      inviteUrl: withSlash(SITE_URL) + "#invite=" + token,
    });

    const suggestions = names.map((name) => bestMatch(name, contacts));
    const usableSuggestion = suggestions.find(Boolean);
    contactRows.push({
      householdId,
      email: usableSuggestion?.emails[0] || "",
      phone: usableSuggestion?.phones[0] || "",
      dm: "",
      contactPreference: usableSuggestion?.phones[0] ? "text" : usableSuggestion?.emails[0] ? "email" : "",
      contactSource: usableSuggestion ? usableSuggestion.source : "",
      contactStatus: usableSuggestion ? "matched" : "needs contact",
      detailsConfirmed: false,
      householdType: partnerName ? "couple" : "single",
      shareMethod: usableSuggestion?.phones[0] ? "text" : usableSuggestion?.emails[0] ? "email" : "",
      shareStatus: "not shared",
      lastSharedAt: "",
      lastEditedBy: "generator",
      suggestion: suggestions
        .filter(Boolean)
        .map((contact) => `${contact.name} (${contact.source}, score ${contact.score})`)
        .join("; "),
    });
  }

  writeCsv("invitees.csv", inviteRows, [
    "householdId",
    "householdLabel",
    "primaryName",
    "partnerName",
    "inviteToken",
    "contactStatus",
  ]);
  writeCsv("contacts.csv", contactRows, [
    "householdId",
    "email",
    "phone",
    "dm",
    "contactPreference",
    "contactSource",
    "contactStatus",
    "detailsConfirmed",
    "householdType",
    "shareMethod",
    "shareStatus",
    "lastSharedAt",
    "lastEditedBy",
    "suggestion",
  ]);
  writeCsv("responses.csv", [], [
    "submittedAt",
    "householdId",
    "inviteToken",
    "status",
    "partnerComing",
    "partnerNameOverride",
    "email",
    "phone",
    "dm",
    "note",
  ]);
  writeCsv("generated-links.csv", linkRows, ["householdLabel", "inviteUrl"]);

  console.log(`Wrote private Google Sheet seed files to ${PRIVATE_DIR}`);
  console.log("These files are ignored by Git. Import invitees.csv, contacts.csv, and responses.csv into a private Google Sheet.");
}

function readExistingTokens() {
  const file = path.join(PRIVATE_DIR, "invitees.csv");
  const tokens = new Map();
  if (!fs.existsSync(file)) return tokens;
  for (const row of parseCsv(fs.readFileSync(file, "utf8"))) {
    if (row.householdId && row.inviteToken) tokens.set(row.householdId, row.inviteToken);
  }
  return tokens;
}

function readCsvContacts(file) {
  if (!fs.existsSync(file)) return [];
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  return rows.map((row) => {
    const first = row["First Name"] || "";
    const middle = row["Middle Name"] || "";
    const last = row["Last Name"] || "";
    const name = [first, middle, last].filter(Boolean).join(" ") || row.Name || row["Full Name"] || "";
    return {
      name: normalizeSpaces(name),
      names: tokenizeName(name),
      emails: Object.entries(row).filter(([key, value]) => /e-mail|email/i.test(key) && value).map(([, value]) => value),
      phones: Object.entries(row).filter(([key, value]) => /phone|mobile/i.test(key) && value).map(([, value]) => value),
      source: "contacts.csv",
    };
  }).filter((contact) => contact.name);
}

function readVcfContacts(file) {
  if (!fs.existsSync(file)) return [];
  const text = unfoldVcard(fs.readFileSync(file, "utf8"));
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  return cards.map((card) => {
    const name = readVcardValue(card, "FN") || readVcardValue(card, "N").split(";").filter(Boolean).reverse().join(" ");
    return {
      name: normalizeSpaces(unescapeVcard(name)),
      names: tokenizeName(name),
      emails: readVcardValues(card, "EMAIL").map(unescapeVcard),
      phones: readVcardValues(card, "TEL").map(unescapeVcard),
      source: "Sunyoung Contacts.vcf",
    };
  }).filter((contact) => contact.name);
}

function bestMatch(name, contacts) {
  const needle = tokenizeName(name);
  const scored = contacts.map((contact) => ({ ...contact, score: scoreContact(needle, contact) }))
    .filter((contact) => contact.score >= 50)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored[0];
}

function scoreContact(needle, contact) {
  let score = 0;
  for (const token of needle) {
    if (contact.names.includes(token)) score += 60;
    if (contact.name.toLowerCase().includes(token)) score += 15;
  }
  if (contact.emails.length) score += 8;
  if (contact.phones.length) score += 10;
  return score;
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);

  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function writeCsv(name, rows, headers) {
  const output = [headers.join(",")];
  for (const row of rows) {
    output.push(headers.map((header) => csvEscape(row[header] || "")).join(","));
  }
  fs.writeFileSync(path.join(PRIVATE_DIR, name), output.join("\n") + "\n");
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function withSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function normalizeSpaces(value) {
  return value.replace(/\s+/g, " ").trim();
}

function tokenizeName(value) {
  return normalizeSpaces(unescapeVcard(value)).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function unfoldVcard(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function readVcardValue(card, key) {
  return readVcardValues(card, key)[0] || "";
}

function readVcardValues(card, key) {
  const values = [];
  const regex = new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "gim");
  let match;
  while ((match = regex.exec(card))) values.push(match[1].trim());
  return values;
}

function unescapeVcard(value) {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}