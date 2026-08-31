/*
  A dev server, for the gates that need to see a page dist does not contain.

  Most of the site is prerendered and gets audited out of dist, which is both faster and
  closer to what Netlify serves. Server rendered utility pages are checked here against a
  real render instead.
*/

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const READY = /localhost:(\d+)/;

export async function serveDev({ timeoutMs = 90_000 } = {}) {
  /*
    Astro's own entry point under this process's node, rather than `pnpm exec astro`.

    Going through a package manager on Windows means a cmd.exe wrapper in the middle, and
    killing the wrapper leaves the dev server running. The gate then finishes, prints its
    result, and never exits, because a grandchild nobody can see is still holding the
    pipe open. Spawning the binary directly makes stop() actually stop it.
  */
  /* The bin is not in the package's exports map, so it is resolved through package.json
     rather than asked for directly. */
  const entry = fileURLToPath(new URL('../../node_modules/astro/astro.js', import.meta.url));

  const proc = spawn(process.execPath, [entry, 'dev', '--port', '0'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('astro dev did not start in time')), timeoutMs);
    let seen = '';

    const onData = (chunk) => {
      seen += String(chunk);
      const match = READY.exec(seen);
      if (!match) return;
      clearTimeout(timer);
      resolve(`http://localhost:${match[1]}`);
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`astro dev exited with ${code}\n${seen}`));
    });
  });

  return { base, stop: () => proc.kill() };
}
