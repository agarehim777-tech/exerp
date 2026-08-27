import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve('supabase/migrations');
const files = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
const seen = new Set();
const errors = [];

for (const file of files) {
  const stamp = file.match(/^(\d{14})_/u)?.[1];
  if (!stamp) errors.push(`${file}: migration adı 14 rəqəmli UTC timestamp ilə başlamır`);
  if (stamp && seen.has(stamp)) errors.push(`${file}: təkrarlanan migration timestamp ${stamp}`);
  if (stamp) seen.add(stamp);
  const sql = fs.readFileSync(path.join(directory, file), 'utf8');
  if (/\bDROP\s+(TABLE|SCHEMA)\b(?!\s+IF\s+EXISTS)/iu.test(sql)) {
    errors.push(`${file}: qorunmayan DROP əməliyyatı`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Migration gate keçdi: ${files.length} fayl, unikal və ardıcıl timestamp.`);
