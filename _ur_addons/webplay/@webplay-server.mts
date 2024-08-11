/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  WebPlay Addon CLI Build and Serve
  Conceptually similar to jsplay addon, except for the browser.

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import { FILE, PROMPTS, PR } from '@ursys/core';
import { APPSERV, APPBUILD } from '@ursys/core';
import PATH from 'node:path';
import FS from 'node:fs';
import { exec } from 'node:child_process';

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
type TSOptions = { field: string; value: any };
import type { BuildOptions } from '@ursys/core';

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const [AO_NAME, AO_DIR] = FILE.DetectedAddonDir();
const ADDON = AO_NAME.toUpperCase();
const [script_name, ...script_args] = process.argv.slice(2);
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const DBG = true;
const { BLU, YEL, RED, DIM, NRM } = PROMPTS.ANSI;
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const LOG = PR(ADDON, 'TagCyan');

/// HELPER METHODS ////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** HELPER: import all server modules in the scripts directory. Hide dependent
 *  scripts in subdirectory of scripts folder. */
async function m_ImportServerModules(tsOpt?: TSOptions): Promise<string[]> {
  const fn = 'm_ImportServerModules:';
  try {
    const mtsFilter = file => file.endsWith('.mts');
    const stashFiles = (await FS.promises.readdir('./_stash')).filter(mtsFilter);
    const scratchFiles = (await FS.promises.readdir('./_scratch')).filter(mtsFilter);
    const LF = {
      init: [],
      config: []
    };
    for (const file of stashFiles) {
      const mod = await import(`./_stash/${file}`);
      if (typeof mod.Init === 'function') LF.init.push(mod.Init);
      if (typeof mod.Config === 'function') LF.config.push(mod.Config);
    }
    for (const file of scratchFiles) {
      const mod = await import(`./_scratch/${file}`);
      if (typeof mod.Init === 'function') LF.init.push(mod.Init);
      if (typeof mod.Config === 'function') LF.config.push(mod.Config);
    }
    // run the init functions
    for (const init of LF.init) await init();
    for (const config of LF.config) await config();
    // return the list of imported files
    return [...stashFiles, ...scratchFiles];
  } catch (error) {
    if (error.message.includes(`find package '_ur`))
      LOG(`${RED}${fn} webplay modules may not use tsconfig paths for imports${NRM}`);
    throw Error(`${fn} Error during dynamic import: ${error.message}`);
  }
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** HELPER: write a temp file that imports client modules to be imported by
 *  webplay-client-entry.ts */
async function m_ImportClientModules(): Promise<string[]> {
  const fn = 'm_ImportClientModules:';
  try {
    const tsFilter = file => file.endsWith('.ts') && !file.startsWith('_');
    await FS.promises.mkdir('./_stash', { recursive: true });
    await FS.promises.mkdir('./_scratch', { recursive: true });
    const stashFiles = (await FS.promises.readdir('./_stash')).filter(tsFilter);
    const scratchFiles = (await FS.promises.readdir('./_scratch')).filter(tsFilter);
    let out = `// autogenerated by ${script_name}\n`;
    for (const file of stashFiles) out += `import './_stash/${file}';\n`;
    for (const file of scratchFiles) out += `import './_scratch/${file}';\n`;
    await FS.promises.writeFile('./webplay-client-imports.ts', out);
    return [...stashFiles, ...scratchFiles];
  } catch (error) {
    if (error.message.includes(`find package '_ur`))
      LOG(`${RED}${fn} webplay modules may not use tsconfig paths for imports${NRM}`);
    throw Error(`${fn} Error during dynamic import: ${error.message}`);
  }
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** HELPER: wait 5 seconds, then print runtime help */
function m_RuntimeHelp() {
  setTimeout(() => {
    LOG('CTRL-C TO EXIT. PRESS RETURN');
  }, 5000);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** RUNTIME: Run tests */
function RunTests() {
  const cli = `npx vitest --config ./${script_name}/webplay-vitest-config.mts`;
  // exec cli and echo output to terminal
  exec(cli, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** RUNTIME: Main function */
async function Run() {
  // define the hot reload callback function
  const notify_cb = payload => {
    const { changed } = payload || {};
    if (DBG && changed) LOG(`${DIM}notify change: ${JSON.stringify(changed)}${NRM}`);
    const EP = APPSERV.GetServerEndpoint();
    EP.netSignal('NET:UR_HOT_RELOAD_APP', { changed });
  };
  // A build consists of (1) building js bundle from CLIENT_ENTRY, and copying the
  // output to HT_DOCS/js followed by (2) copying assets from HT_ASSETS to HT_DOCS,
  // which includes an index.html file that loads the js bundle. You have to write
  // the index file yourself.
  const tsFiles = await m_ImportClientModules();
  LOG(`.. bundling client modules: ${YEL}${tsFiles.join(' ')}${NRM}`);
  // note these are NOT the same as esbuild options, because we may use a different
  // build system in the future. This is just a helper function to save the options.
  const buildOpts: BuildOptions = {
    source_dir: SRC,
    asset_dir: HT_ASSETS,
    output_dir: HT_DOCS,
    entry_file: CLIENT_ENTRY_FILE,
    bundle_name: CLIENT_BUNDLE_NAME,
    //
    notify_cb // hot reload callback, added to esbuild events
  };
  APPBUILD.SetBuildOptions(buildOpts);
  LOG(`Using esbuild to assemble website -> ${BLU}${FILE.u_short(HT_DOCS)}${NRM}`);
  await APPBUILD.BuildApp(buildOpts);
  const htdocs_short = FILE.u_short(HT_DOCS);
  LOG(`Live Reload Service is monitoring ${htdocs_short}`);
  await APPBUILD.WatchExtra({ watch_dirs: [`${SRC}/**`], notify_cb });
  const serverOpts = {
    http_port: 8080,
    http_host: 'localhost',
    http_docs: HT_DOCS,
    index_file: 'webplay-index.html',
    wss_path: 'webplay-ws'
  };
  await APPSERV.Start(serverOpts);
  // import services after server is started
  const mtsFiles = await m_ImportServerModules();
  LOG(`imported server modules: ${YEL}${mtsFiles.join(' ')}${NRM}`);
  m_RuntimeHelp();
}

/// RUNTIME ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const SRC = AO_DIR; // point to addon dir
const HT_ASSETS = PATH.join(SRC, 'assets');
const HT_DOCS = FILE.AbsLocalPath('_ur_addons/_public');
const CLIENT_ENTRY_FILE = 'webplay-client-entry.ts';
const CLIENT_BUNDLE_NAME = 'client-bundle';
const TSCONFIG_FILE = PATH.join(SRC, '../../tsconfig.json');
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
(async () => {
  LOG(`${ADDON} URNET Live Reload Playground for Browsers`);
  LOG(
    `${BLU}QUICKSTART: ts and mts files are autoloaded from './_stash and _scratch'${NRM}`
  );
  await Run();
})();