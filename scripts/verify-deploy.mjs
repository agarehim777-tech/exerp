import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readProjectFile(relativePath) {
  return readFile(resolve(rootDir, relativePath), "utf8");
}

function assertIncludes(content, expected, fileName, failures) {
  if (!content.includes(expected)) {
    failures.push(`${fileName}: missing ${expected}`);
  }
}

const [packageText, dockerfile, nginxConfig, headersConfig, dockerignore, indexHtml] = await Promise.all([
  readProjectFile("package.json"),
  readProjectFile("Dockerfile"),
  readProjectFile("deploy/nginx.conf"),
  readProjectFile("deploy/security-headers.conf"),
  readProjectFile(".dockerignore"),
  readProjectFile("index.html"),
]);

const packageJson = JSON.parse(packageText);
const failures = [];

if (!packageJson.devDependencies?.vite?.startsWith("^8.")) {
  failures.push("package.json: Vite 8 devDependency is required");
}
if (packageJson.dependencies?.vite || packageJson.dependencies?.["@vitejs/plugin-react"]) {
  failures.push("package.json: build-only Vite dependencies must not be runtime dependencies");
}
if (!packageJson.scripts?.["smoke:prod"] || !packageJson.scripts?.["verify:deploy"]) {
  failures.push("package.json: production smoke and deploy verification scripts are required");
}

for (const expected of ["npm ci", "npm run build", "deploy/security-headers.conf", "HEALTHCHECK"]) {
  assertIncludes(dockerfile, expected, "Dockerfile", failures);
}
for (const expected of [".env", ".env.*", "!.env.example"]) {
  assertIncludes(dockerignore, expected, ".dockerignore", failures);
}
for (const expected of ["server_tokens off", "location = /healthz", "try_files $uri $uri/ /index.html", "location ~ /\\."]) {
  assertIncludes(nginxConfig, expected, "deploy/nginx.conf", failures);
}
for (const expected of [
  "Content-Security-Policy",
  "Cross-Origin-Opener-Policy",
  "Permissions-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
]) {
  assertIncludes(headersConfig, expected, "deploy/security-headers.conf", failures);
}
for (const corruptedText of ["AzЙ", "Гј", "Д±"]) {
  if (indexHtml.includes(corruptedText)) {
    failures.push(`index.html: contains corrupted encoding marker ${corruptedText}`);
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, checks: 22 }, null, 2));
}
