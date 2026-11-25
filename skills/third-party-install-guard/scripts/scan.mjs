#!/usr/bin/env node
// Static red-flag scan of a downloaded third-party package/repo. Reads files only, never executes them.
// Usage: node scan.mjs <dir-or-file> [--json]
// Exit code: 0 = no HIGH findings, 1 = HIGH findings present, 2 = usage error.
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
const asJson = process.argv.includes('--json');
if (!target || !fs.existsSync(target)) {
  console.error('Usage: node scan.mjs <dir-or-file> [--json]');
  process.exit(2);
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP_DIRS = new Set(['.git']);
const BINARY_EXT = new Set(['.exe', '.dll', '.so', '.dylib', '.node', '.bin', '.msi', '.scr', '.com', '.bat', '.cmd', '.ps1', '.vbs', '.jar', '.pyc', '.pyd', '.wasm', '.apk', '.dmg', '.pkg', '.deb', '.rpm', '.appimage']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx', '.py', '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd', '.vbs', '.rb', '.go', '.rs', '.php', '.pl', '.lua', '.json', '.jsonc', '.toml', '.yaml', '.yml', '.cfg', '.ini', '.md', '.mdx', '.txt', '.html', '.htm', '.xml', '.gradle', '.kts', '.mk', '.cmake', '.dockerfile', '']);

// [severity, id, description, regex]
const RULES = [
  // curl … | sh (sudo or doas with options, env, NAME=value, busybox, a path, more pipes between, a quoted URL with & or ;
  // in it; python/node/perl/ruby only when they read a script from stdin: alone or with "-"), sh -c / eval / ruby -e /
  // python3 -c "$(curl …)", bash <(curl …), source <(curl …), iex (irm …), iex "& { $(irm …) }", PowerShell downloaders.
  ['HIGH', 'remote-exec', 'Downloads and executes remote code', /\b(curl|wget)\b(\\.|[^\n;&|"'\\]|"[^"\n]{0,400}"|'[^'\n]{0,400}'|\|(?![|&])){0,1000}?\|&?\s*((sudo|doas)(\s+-\S+)*\s+|(\S*\/)?env(\s+-\S+)*(\s+\w+=\S*)*\s+|\w+=\S*\s+|(busybox|exec|command|nohup|nice|time)\s+)*(\S*[\/\\])?(((ba|z|da|k|fi|a|c|tc)?sh|pwsh|powershell)\b(?!-)|(python[0-9.]*|py|node|perl|ruby|php)(\.exe)?(\s+-(\s|$)|\s*($|["')`;&|])))|\b((ba|z|da|k|fi|a)?sh\b[^\n;&|]*?\s-[a-z]*c|eval|(python[0-9.]*|py|node|perl|ruby|php|pwsh|powershell)(\.exe)?\b[^\n;&|]*?\s-([a-z]*[ecr]|command))\s+["']?(\$\(|`)\s*(\S*\/)?(curl|wget)\b|\b(iex|Invoke-Expression)\s+["'][^"'\n]*\$\(\s*(iwr|irm|Invoke-WebRequest|Invoke-RestMethod|New-Object)|(\b(ba|z|da|k|fi|a)?sh\b[^\n;&|<]*|\bsource|(^|[\s;&|])\.)\s+(<\s*)?<\(\s*(\S*\/)?(curl|wget)\b|\b(iex|Invoke-Expression)[\s($]*(iwr|irm|Invoke-WebRequest|Invoke-RestMethod|New-Object|\[?(System\.)?Net\.WebClient)|\[scriptblock\]::Create[\s($]*(iwr|irm|Invoke-WebRequest|Invoke-RestMethod|New-Object)|\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*\|\s*(iex|Invoke-Expression)|DownloadString\s*\(|DownloadFile\s*\(|certutil[^\n]*-urlcache|bitsadmin[^\n]*\/transfer|\bmshta\b|regsvr32[^\n]*\/i:http/i],
  ['HIGH', 'encoded-shell', 'Encoded/hidden PowerShell or shell payload', /powershell[^\n]*-(e|enc|encodedcommand)\s+[A-Za-z0-9+/=]{20,}|-WindowStyle\s+Hidden|base64\s+(-d|--decode)[^\n]*\|\s*(ba)?sh/i],
  ['HIGH', 'eval-decoded', 'Evaluates decoded/obfuscated data', /\b(eval|new\s+Function|exec|execSync|spawn)\s*\(\s*(atob|Buffer\.from|unescape|decodeURIComponent|String\.fromCharCode|zlib\.|base64\.b64decode|bytes\.fromhex|codecs\.decode)|\bexec\s*\(\s*(compile|base64|zlib|marshal)|marshal\.loads|pickle\.loads\s*\(\s*(base64|requests|urllib)/i],
  ['HIGH', 'credential-access', 'Reads credentials, keys, browser or wallet data', /\.ssh[\/\\](id_|authorized_keys|known_hosts)|\.aws[\/\\]credentials|\.docker[\/\\]config\.json|\.kube[\/\\]config|\.npmrc|\.pypirc|\.git-credentials|\.netrc|\.claude[\/\\](\.credentials|credentials)|\.claude\.json|Login Data|Local State|Cookies\b.*(Chrome|Edge|Brave)|User Data[\/\\]Default|Local Extension Settings|nkbihfbeogaeaoehlefnkodbefgpgknn|exodus|electrum|metamask|phantom|solana[\/\\]id\.json|keychain|Keychains|discord[^\n]*(Local Storage|leveldb)|wallet\.dat/i],
  ['HIGH', 'env-dump', 'Collects the whole environment (tokens/keys)', /JSON\.stringify\s*\(\s*process\.env\s*\)|Object\.(entries|keys)\s*\(\s*process\.env\s*\)|dict\s*\(\s*os\.environ\s*\)|os\.environ\.copy\(\)[^\n]*(post|send|request)|Get-ChildItem\s+env:/i],
  ['HIGH', 'exfil-endpoint', 'Known exfiltration / paste / tunnel endpoint', /discord(app)?\.com\/api\/webhooks|api\.telegram\.org\/bot|webhook\.site|pipedream\.net|requestbin|ngrok(-free)?\.(io|app)|interact\.sh|oast\.(fun|pro|live|site|online|me)|burpcollaborator|pastebin\.com\/raw|transfer\.sh|paste\.ee|hastebin|0x0\.st|trycloudflare\.com/i],
  ['HIGH', 'persistence', 'Installs persistence (autostart, cron, shell profile)', /CurrentVersion\\\\?Run\b|schtasks[^\n]*\/create|Register-ScheduledTask|New-Service|\\Start Menu\\Programs\\Startup|LaunchAgents|LaunchDaemons|crontab\s+-|\/etc\/cron|systemctl\s+enable|>>\s*~?\/?\.?(bashrc|zshrc|profile|bash_profile)|\.(bashrc|zshrc|bash_profile)['"]?\s*,\s*['"]a/i],
  ['HIGH', 'destructive', 'Destructive file system / disk command', /rm\s+-rf\s+(--no-preserve-root\s+)?(\/|~|\$HOME)(\s|$|["'])|Remove-Item[^\n]*-Recurse[^\n]*(\$env:USERPROFILE|\$HOME|C:\\\\?)(\s|$|["'])|\bformat\s+[a-z]:|del\s+\/[sfq][^\n]*[a-z]:\\|vssadmin[^\n]*delete|cipher\s+\/w|mkfs\./i],
  ['HIGH', 'defense-evasion', 'Disables security tooling or hides activity', /Set-MpPreference[^\n]*(Disable|Exclusion)|Add-MpPreference[^\n]*Exclusion|netsh\s+advfirewall[^\n]*off|setenforce\s+0|ufw\s+disable|history\s+-c|unset\s+HISTFILE|attrib\s+\+h/i],
  ['HIGH', 'prompt-injection', 'Text that tries to instruct an AI agent', /ignore\s+(all\s+)?(previous|prior|above)\s+instructions|disregard\s+(the\s+)?(system|previous)\s+prompt|do\s+not\s+(tell|inform|mention\s+to)\s+the\s+user|without\s+(telling|asking|informing)\s+the\s+user|you\s+are\s+now\s+in\s+(developer|admin|god)\s+mode|<\s*\/?\s*(system|important|admin)[-_ ]?(prompt|instructions?)?\s*>/i],
  ['HIGH', 'hidden-unicode', 'Invisible / bidi control characters (Trojan Source, hidden prompts)', /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u2060-\u2064\uFEFF\u{E0000}-\u{E007F}]/u],
  ['MEDIUM', 'child-process', 'Spawns processes / shell', /require\(['"]child_process['"]\)|from\s+['"](node:)?child_process['"]|\bsubprocess\.(Popen|run|call|check_output)|os\.system\s*\(|os\.popen\s*\(|Runtime\.getRuntime\(\)\.exec|Start-Process|ShellExecute/i],
  ['MEDIUM', 'network', 'Network calls (check where data goes)', /\bfetch\s*\(\s*['"`]https?:|axios\.(post|get)\s*\(|https?\.request\s*\(|requests\.(post|get|put)|urllib\.request|import\s+http\.client|net\.connect|new\s+WebSocket|socket\.socket\s*\(|dns\.resolve|new\s+XMLHttpRequest/i],
  ['MEDIUM', 'raw-ip-url', 'URL with a raw IP address', /https?:\/\/(\d{1,3}\.){3}\d{1,3}(?!\.)(:\d+)?/],
  ['MEDIUM', 'dynamic-code', 'Dynamic code execution', /(?<![.\w$])eval\s*\(|new\s+Function\s*\(|vm\.runIn(New|This)?Context|importlib\.import_module\s*\(\s*[a-z_]+\s*\)|__import__\s*\(|(?<![.\w$])exec\s*\(\s*[a-z_]/i],
  ['MEDIUM', 'obfuscation', 'Obfuscation markers', /_0x[0-9a-f]{4,}|\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){20,}|String\.fromCharCode\s*\((\s*\d+\s*,){15,}|[A-Za-z0-9+/]{400,}={0,2}/i],
  ['MEDIUM', 'sensitive-env', 'Reads well-known secret env vars', /(ANTHROPIC|OPENAI|GITHUB|GH|NPM|AWS_SECRET|AWS_ACCESS|SLACK|STRIPE|TELEGRAM|DISCORD)_?(API_)?(KEY|TOKEN|SECRET)/],
  ['MEDIUM', 'privilege', 'Asks for elevated privileges', /\bsudo\s+|runas\s+\/user|-Verb\s+RunAs|chmod\s+(777|\+s|u\+s)|setuid/i],
  ['LOW', 'fs-home', 'Touches the user home directory', /os\.homedir\(\)|os\.path\.expanduser|\$env:USERPROFILE|%USERPROFILE%|%APPDATA%|\$HOME\b/i],
];

// Files that run automatically on install, open, or agent start: always worth a full read.
const AUTO_RUN_NAMES = [
  /(^|\/)package\.json$/, /(^|\/)setup\.py$/, /(^|\/)setup\.cfg$/, /(^|\/)pyproject\.toml$/, /(^|\/)build\.rs$/, /(^|\/)binding\.gyp$/,
  /(^|\/)\.npmrc$/, /(^|\/)\.yarnrc(\.yml)?$/, /(^|\/)\.gitattributes$/, /(^|\/)\.husky\//, /(^|\/)\.githooks?\//,
  /(^|\/)\.vscode\/tasks\.json$/, /(^|\/)\.vscode\/settings\.json$/, /(^|\/)\.devcontainer\//,
  /(^|\/)\.claude\/settings(\.local)?\.json$/, /(^|\/)hooks\/hooks\.json$/, /(^|\/)\.claude-plugin\//, /(^|\/)\.mcp\.json$/,
  /(^|\/)SKILL\.md$/i, /(^|\/)(CLAUDE|AGENTS|GEMINI)\.md$/i, /(^|\/)\.cursor(rules|\/)/,
  /(^|\/)Makefile$/, /(^|\/)Dockerfile$/, /(^|\/)docker-compose\.ya?ml$/, /(^|\/)install\.(sh|ps1)$/, /(^|\/)\.github\/workflows\//,
];
const INSTALL_SCRIPT_KEYS = ['preinstall', 'install', 'postinstall'];
// Run only when installed from git or a local path, not from the registry tarball.
const SOURCE_INSTALL_SCRIPT_KEYS = ['prepare', 'preprepare', 'postprepare'];

// Not hidden text: a zero-width joiner between two emoji (woman + laptop, flag + rainbow), and the three subdivision
// flags Unicode recommends (England, Scotland, Wales), spelled out exactly: any other tag letters can carry hidden text.
// Removed before the hidden-unicode rule, which still catches the same characters anywhere else.
const BENIGN_UNICODE = /(?<=\p{Extended_Pictographic}[\u{FE0F}\u{1F3FB}-\u{1F3FF}]?)\u200D(?=\p{Extended_Pictographic})|\u{1F3F4}\u{E0067}\u{E0062}(\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}/gu;

// A line that ends in an odd number of backslashes, a pipe or && continues on the next one (shell, Dockerfile,
// Makefile): join them so a command split over lines is read whole. At most 20 lines or 4,000 characters are joined,
// so a file of continued lines stays fast; then a new logical line starts. Each logical line keeps the offsets where
// its physical lines start, so a finding is reported at the line it is on.
const MAX_JOIN_LINES = 20, MAX_JOIN_CHARS = 4000;
function logicalLines(text) {
  const out = [];
  let cur = null;
  text.split(/\r?\n/).forEach((line, i) => {
    if (cur === null) cur = { first: i + 1, text: '', starts: [] };
    cur.starts.push(cur.text.length);
    const slashes = line.length - line.replace(/\\+$/, '').length;
    const goesOn = slashes % 2 === 1 || /(\||&&)\s*$/.test(line);
    const full = cur.starts.length >= MAX_JOIN_LINES || cur.text.length + line.length > MAX_JOIN_CHARS;
    if (goesOn && !full) { cur.text += (slashes % 2 === 1 ? line.slice(0, -1) : line) + ' '; return; }
    cur.text += line;
    out.push(cur);
    cur = null;
  });
  if (cur !== null) out.push(cur);
  return out;
}
const FAR_FETCH = /\b(curl|wget)\b/i;
const FAR_PIPE_SHELL = /(?<!\|)\|(?!\|)&?\s*(sudo\s+)?(\S*\/)?(ba|z|da|k|fi|a|c|tc)?sh\b(?!-)/i;

// A very long line (minified code, a data blob) is matched in windows of 8,000 characters that overlap by 2,000, so
// rules with open-ended spans stay linear; a match up to 2,000 characters long is never split.
const WINDOW = 8000, OVERLAP = 2000;
function* windows(text) {
  if (text.length <= WINDOW) { yield [0, text]; return; }
  for (let off = 0; off < text.length; off += WINDOW - OVERLAP) {
    yield [off, text.slice(off, off + WINDOW)];
    if (off + WINDOW >= text.length) return;
  }
}
function lineAt(l, index) {
  let k = 0;
  while (k + 1 < l.starts.length && l.starts[k + 1] <= index) k++;
  return l.first + k;
}

const findings = [];
const autoRunFiles = [];
const binaries = [];
let filesScanned = 0;

function add(severity, id, desc, file, line, excerpt) {
  findings.push({ severity, id, desc, file, line, excerpt: excerpt?.trim().slice(0, 160) });
}

function walk(p) {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) {
    add('MEDIUM', 'symlink', 'Symlink (may point outside the package)', rel(p), 0, safeReadlink(p));
    return;
  }
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(p))) return;
    for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    return;
  }
  scanFile(p, st.size);
}

function safeReadlink(p) {
  try { return '-> ' + fs.readlinkSync(p); } catch { return ''; }
}

function rel(p) {
  const r = path.relative(fs.statSync(target).isDirectory() ? target : path.dirname(target), p);
  return r.split(path.sep).join('/') || path.basename(p);
}

function scanFile(p, size) {
  const r = rel(p);
  const ext = path.extname(p).toLowerCase();
  if (AUTO_RUN_NAMES.some((re) => re.test(r))) autoRunFiles.push(r);

  const buf = fs.readFileSync(p, { flag: 'r' }).subarray(0, MAX_FILE_BYTES);
  const isBinary = buf.subarray(0, 8000).includes(0);
  if (isBinary || (BINARY_EXT.has(ext) && !TEXT_EXT.has(ext))) {
    binaries.push({ file: r, bytes: size });
    return;
  }
  if (ext === '.map' || (!TEXT_EXT.has(ext) && size > 512 * 1024)) return;
  filesScanned++;

  // A UTF-8 byte order mark at the very start is how some editors save files, not hidden text.
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (size > MAX_FILE_BYTES) add('LOW', 'truncated', `File larger than ${MAX_FILE_BYTES} bytes, only the start was scanned`, r, 0);

  const lines = text.split(/\r?\n/);
  const isMinifiedSource = /\.(m|c)?js$/.test(ext) && lines.some((l) => l.length > 5000) && !/(^|\/)(dist|build|min|vendor)\//.test(r) && !/\.min\./.test(r);
  if (isMinifiedSource) add('MEDIUM', 'minified-source', 'Very long lines in a non-dist source file (possible hidden payload)', r, 0);

  for (const l of logicalLines(text)) {
    let execFound = false;
    for (const [sev, id, desc, re] of RULES) {
      const subject = id === 'hidden-unicode' ? l.text.replace(BENIGN_UNICODE, '') : l.text;
      for (const [off, part] of windows(subject)) {
        const m = re.exec(part);
        if (!m) continue;
        const at = off + m.index;
        add(sev, id, desc, r, lineAt(l, at), subject.length > 160 ? subject.slice(Math.max(0, at - 50), at + 110) : subject);
        if (id === 'remote-exec') execFound = true;
        break;
      }
    }
    // The windows and the bounded spans keep the remote-exec rule fast, so a download and a pipe to a shell padded
    // further apart than they reach are caught here: two plain tests, no open span.
    const far = execFound ? null : FAR_FETCH.exec(l.text);
    const pipe = far && FAR_PIPE_SHELL.exec(l.text.slice(far.index));
    if (pipe) add('HIGH', 'remote-exec', 'Downloads and executes remote code (download and shell far apart on one line)', r, lineAt(l, far.index + pipe.index), l.text.slice(far.index, far.index + 160));
  }

  if (path.basename(p) === 'package.json') checkPackageJson(text, r);
}

function checkPackageJson(text, r) {
  let pkg;
  try { pkg = JSON.parse(text); } catch { return; }
  for (const key of INSTALL_SCRIPT_KEYS) {
    if (pkg.scripts?.[key]) add('HIGH', 'install-script', `Runs automatically on install: "${key}"`, r, 0, pkg.scripts[key]);
  }
  for (const key of SOURCE_INSTALL_SCRIPT_KEYS) {
    if (pkg.scripts?.[key]) add('MEDIUM', 'source-install-script', `Runs on install from git/local path: "${key}"`, r, 0, pkg.scripts[key]);
  }
  for (const field of ['dependencies', 'optionalDependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (/^(git\+|git:|github:|https?:|file:|link:)|^[\w-]+\/[\w.-]+(#.*)?$/.test(String(spec))) {
        add('MEDIUM', 'non-registry-dep', `${field}: "${name}" comes from outside the registry`, r, 0, `${name}: ${spec}`);
      }
    }
  }
  if (pkg.bin) add('LOW', 'bin', 'Exposes CLI commands on PATH', r, 0, JSON.stringify(pkg.bin));
}

walk(target);

const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
for (const f of findings) counts[f.severity]++;

if (asJson) {
  console.log(JSON.stringify({ target, filesScanned, counts, autoRunFiles, binaries, findings }, null, 2));
} else {
  console.log(`Target: ${target}`);
  console.log(`Text files scanned: ${filesScanned}   HIGH: ${counts.HIGH}   MEDIUM: ${counts.MEDIUM}   LOW: ${counts.LOW}`);
  console.log(`\nAuto-run / agent-config files (read each one in full):\n${autoRunFiles.map((f) => '  ' + f).join('\n') || '  none'}`);
  console.log(`\nBinary files (cannot be reviewed as text):\n${binaries.map((b) => `  ${b.file} (${b.bytes} B)`).join('\n') || '  none'}`);
  const byRule = new Map();
  for (const f of findings) {
    const key = `${f.severity} ${f.id}`;
    if (!byRule.has(key)) byRule.set(key, { desc: f.desc, items: [] });
    byRule.get(key).items.push(f);
  }
  for (const [key, { desc, items }] of byRule) {
    console.log(`\n[${key}] ${desc} (${items.length})`);
    for (const f of items.slice(0, 15)) console.log(`  ${f.file}${f.line ? ':' + f.line : ''}  ${f.excerpt ?? ''}`);
    if (items.length > 15) console.log(`  ... ${items.length - 15} more (use --json for all)`);
  }
}
process.exit(counts.HIGH > 0 ? 1 : 0);
