/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  WebPlay Addon CLI Build and Serve
  Conceptually similar to jsplay addon, except for the browser.

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import { FILE, PROMPTS } from 'ursys/server';
import { UR_StartLifecycle, UR_Build } from './webplay-svc-server.mts';

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
type TSOptions = { field: string; value: any };
import type { BuildOptions } from 'ursys/server';

/// IMPORTED CLASSES & CONSTANTS //////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const { BLU, YEL, RED, DIM, NRM } = PROMPTS.ANSI;

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const [AO_NAME, AO_DIR] = FILE.DetectedAddonDir();
const ADDON = AO_NAME.toUpperCase();
const [script_name, ...script_args] = process.argv.slice(2);
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const DBG = true;
const LOG = PROMPTS.TerminalLog(ADDON, 'TagCyan');

/// RUNTIME ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
(async () => {
  LOG(`${ADDON} URNET Live Reload Playground for Browsers`);
  LOG(
    `${BLU}QUICKSTART: ts and mts files are autoloaded from './_stash and _scratch'${NRM}`
  );
  await UR_Build();
  await UR_StartLifecycle();
})();
