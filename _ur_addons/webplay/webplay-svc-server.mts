/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  Webplay Server Services
  UR_Build, Lifecycle

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import { PR, CLASS } from '@ursys/core';
import { FILE, PROMPTS } from '@ursys/core';
import { APPSERV, APPBUILD } from '@ursys/core';
import PATH from 'node:path';
import FS from 'node:fs';

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
type TSOptions = { field: string; value: any };
import type { BuildOptions } from '@ursys/core';

/// IMPORTED CLASSES & CONSTANTS //////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const { BLU, YEL, RED, DIM, NRM } = PROMPTS.ANSI;

/// IMPORTED CLASSES & CONSTANTS //////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const { PhaseMachine } = CLASS;

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const [AO_NAME, AO_DIR] = FILE.DetectedAddonDir();
const ADDON = AO_NAME.toUpperCase();
const [script_name, ...script_args] = process.argv.slice(2);
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const LOG = PR('WP.SVC', 'TagCyan');
const DBG = true;
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
let PM: typeof PhaseMachine;
const m_rebuild_subs = new Set<Function>();

/// IMPORTED HELPER METHODS ///////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const { HookPhase, RunPhaseGroup, GetMachine } = PhaseMachine; // static
const { AddMessageHandler, RemoveMessageHandler, GetServerEndpoint } = APPSERV;

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
    // load stash and scratch modules
    for (const file of stashFiles) await import(`./_stash/${file}`);
    for (const file of scratchFiles) await import(`./_scratch/${file}`);
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

/// API: BUILD SOURCES ////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const SRC = AO_DIR; // point to addon dir
const HT_ASSETS = PATH.join(SRC, 'assets');
const HT_DOCS = FILE.AbsLocalPath('_ur_addons/_public');
const CLIENT_ENTRY_FILE = 'webplay-client-entry.ts';
const CLIENT_BUNDLE_NAME = 'client-bundle';
const TSCONFIG_FILE = PATH.join(SRC, '../../tsconfig.json');
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: UR_Build found scripts in the _stash and _scratch directories. */
async function UR_Build() {
  const fn = 'UR_Build:';
  LOG(`${fn} Building WebPlay Sources`);
  // define the hot reload callback function
  const notify_cb = payload => {
    const { changed } = payload || {};
    if (changed === undefined) return;
    if (DBG) LOG(`${DIM}notify change: ${changed}${NRM}`);
    // is this a file on the server?
    if (changed.endsWith('.mts')) {
      // do nothing
    }
    // is this a file in the client?
    if (changed.endsWith('.ts')) {
      const EP = APPSERV.GetServerEndpoint();
      EP.netSignal('NET:UR_HOT_RELOAD_APP', { changed });
    }
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

/// API METHODS ///////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: initialize the server's lifecycle */
async function UR_StartLifecycle() {
  const fn = 'UR_StartLifecycle:';
  if (PM === undefined)
    PM = new PhaseMachine('URSYS', {
      PHASE_INIT: [
        'SRV_BOOT', // boot the system
        'SRV_INIT', // allocate system data structures
        'SRV_CONFIG' // configure the system
      ],
      PHASE_LOAD: [
        'LOAD_INIT', // initialize data structures
        'LOAD_FILES', // load data from server
        'LOAD_CONFIG' // finalize data
      ],
      PHASE_CONNECT: [
        'EXPRESS_INIT', // express allocate data structures
        'EXPRESS_CONFIG', // express add middleware routes
        'EXPRESS_READY', // express server is ready to start
        'EXPRESS_LISTEN', // express server is listening
        'URNET_LISTEN' // ursys network is listening on socket-ish connection
      ],
      PHASE_READY: ['SRV_READY'],
      PHASE_RUN: ['SRV_START', 'SRV_RUN']
    });
  LOG(`${fn} Executing Phase Groups`);
  await RunPhaseGroup('URSYS/PHASE_INIT');
  await RunPhaseGroup('URSYS/PHASE_LOAD');
  await RunPhaseGroup('URSYS/PHASE_CONNECT');
  await RunPhaseGroup('URSYS/PHASE_READY');
  await RunPhaseGroup('URSYS/PHASE_RUN');
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: return the current phase machine state */
function UR_MachineState() {
  const fn = 'UR_MachineState:';
  if (PM === undefined) throw Error(`${fn} URSYS PhaseMachine not yet defined`);
  return {
    phaseGroup: PM.cur_group,
    phase: PM.cur_phase
  };
}

/// EXPORTS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export {
  UR_Build,
  //
  AddMessageHandler,
  RemoveMessageHandler,
  GetServerEndpoint
};

export {
  UR_StartLifecycle,
  UR_MachineState,
  //
  RunPhaseGroup,
  HookPhase,
  GetMachine
};
