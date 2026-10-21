/** Package complete and selected static manuals for runtime selection without a compiler. */
import { readFile, writeFile, mkdir, rm, rename, readdir, lstat, symlink } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build.mjs';
import { readAirgapVersion, projectAirgap } from './airgap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Build every available manual, sharing immutable assets while keeping routes and indexes separate. */
export async function buildRuntime({ source = resolve(HERE, '..'), output = resolve(HERE, 'runtime-dist'), progress = () => {}, airgapVersion } = {}) {
  source = resolve(source); output = resolve(output);
  const outputFromSource = relative(output, source);
  if (!outputFromSource || !outputFromSource.startsWith('..')) throw new Error('Build output cannot contain the source tree');
  const config = JSON.parse(await readFile(join(source, 'docs.json'), 'utf8'));
  const versions = config.navigation?.products?.find(product => product.product === 'Zylon')?.versions ?? [];
  const selections = versions.map(version => projectAirgap(config, version.version).version);
  if (selections.some(version => !/^\d+(?:\.\d+)*$/.test(version)) || new Set(selections).size !== selections.length) {
    throw new Error('Runtime manuals require distinct numeric documentation versions');
  }
  const defaultVersion = projectAirgap(config, airgapVersion === undefined ? await readAirgapVersion(source, process.env.AIRGAP_VERSION) : airgapVersion).version;
  const staging = output + '.building';
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    const all = join(staging, 'all/docs');
    await buildSite({ source, output: all, airgapVersion: '', progress });
    const shared = ['images', 'files', 'logo', (config.favicon ?? '/favicon.png').slice(1),
      ...(await readdir(join(HERE, 'assets'))).map(name => '_offline/' + name)];
    for (const version of selections) {
      progress(`Building runtime manual ${version}`);
      const selected = join(staging, 'versions', version, 'docs');
      await buildSite({ source, output: selected, airgapVersion: version, progress });
      for (const asset of new Set(shared)) {
        const target = join(all, asset), link = join(selected, asset);
        try { await lstat(target); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        await rm(link, { recursive: true, force: true });
        await mkdir(dirname(link), { recursive: true });
        await symlink(relative(dirname(link), target), link);
      }
    }
    await writeFile(join(staging, 'versions.txt'), selections.join('\n') + '\n');
    await writeFile(join(staging, 'default-version'), defaultVersion + '\n');
    await rm(output, { recursive: true, force: true });
    await rename(staging, output);
    return { versions: selections, defaultVersion };
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await buildRuntime({ progress: console.log });
  console.log(`Packaged complete documentation and ${report.versions.length} runtime manuals (default: ${report.defaultVersion || 'all'})`);
}
