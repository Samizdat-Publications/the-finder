// node tools/showcase/build-site.mjs [--deploy]
//
// Builds the public landing page (site/, hand-written, no framework) into site-dist/ for Cloudflare Pages,
// then finishes it with the showcase kit's finish-site.mjs (headers, byte-range routing for the .mp4 clips,
// the 25 MiB check). The game itself stays on its own Worker (the-finder.stewartgregerson.workers.dev); the
// landing page only links to it. With --deploy it also runs wrangler pages deploy to the project the-finder.
// The clips come from tools/showcase/film.mjs (see docs/making-of/showcase.md).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../harness/serve.mjs';

const KIT = 'C:\\Users\\stewa\\Documents\\Claude\\Github Hub\\kit';
const out = join(ROOT, 'site-dist');
rmSync(out, { recursive: true, force: true });
cpSync(join(ROOT, 'site'), out, { recursive: true });
cpSync(join(ROOT, 'public', 'favicon.svg'), join(out, 'favicon.svg'));

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const finish = join(KIT, 'tools', 'finish-site.mjs');
if (!existsSync(finish)) throw new Error(`showcase kit not found at ${KIT}`);
run(process.execPath, [finish, out, '--root', ROOT]);
if (process.argv.includes('--deploy')) {
  run(process.execPath, [join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'pages', 'deploy', out, '--project-name', 'the-finder', '--branch', 'main', '--commit-dirty=true']);
}
