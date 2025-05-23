/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  SNA-NODE-CONTEXT manages shared configuration and state across an SNA App and
  its associated servers. It's maintained on the server

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import { TerminalLog, ANSI } from '../common/util-prompts.ts';
import { SNA_NewComponent, SNA_HookServerPhase } from './sna-node-hooks.mts';

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
import type { NetEndpoint } from '../common/class-urnet-endpoint.js';
import type { OpResult, DataObj } from '../_types/dataset.ts';
type LockState = 'init' | 'preconfig' | 'prehook' | 'locked';

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const LOG = TerminalLog('SNA.HOOK', 'TagCyan');
const DBG = true;
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
let SERVER_CFG: DataObj = {}; // pre-provided configuration object
let CFG_STATE: Set<LockState> = new Set();

/// HELPER METHODS ////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/*** return lockstate if state successfully changed, undefined otherwise */
function SNA_SetLockState(state: LockState): LockState {
  if (CFG_STATE.has(state)) {
    throw Error(`Lock state ${state} already set`);
  }
  // enforce order of state progression
  if (state === 'init' && CFG_STATE.size !== 0) {
    throw Error(`Lock state ${state} can only be set first`);
  }
  if (state === 'preconfig' && !CFG_STATE.has('init')) {
    throw Error(`Lock state ${state} can only be set after 'init'`);
  }
  if (state === 'prehook' && !CFG_STATE.has('preconfig')) {
    throw Error(`Lock state ${state} can only be set after 'preconfig'`);
  }
  if (state === 'locked' && !CFG_STATE.has('prehook')) {
    throw Error(`Lock state ${state} can only be set after 'prehook'`);
  }
  CFG_STATE.add(state);
  return state;
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** return true if state is set, false otherwise */
function SNA_GetLockState(state: LockState): boolean {
  return CFG_STATE.has(state);
}

/// API METHODS ///////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: register a global configuration object for server, merging with the
 *  existing configuration */
function SNA_SetServerConfig(config: DataObj): DataObj {
  // when no config is provided, return the current global config
  if (config === undefined) return SERVER_CFG;
  // otherwise merge the new config with the existing global config
  if (Object.keys(SERVER_CFG).length === 0) {
    if (DBG) LOG(`Setting SNA Global Configuration`);
  } else if (DBG) LOG(`Updating SNA Global Configuration`);
  SERVER_CFG = Object.assign(SERVER_CFG, config);
  // return a copy of the global config
  return { ...SERVER_CFG };
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: return the current global configuration object for server after start */
function SNA_GetServerConfig(): DataObj {
  const fn = 'SNA_GetServerConfig:';
  if (!SNA_GetLockState('preconfig')) {
    const keys = Array.from(CFG_STATE);
    if (keys.length === 0) {
      console.warn(`${fn} called early; no config keys are set`);
    } else {
      console.warn(`${fn} early config access detected; has ${keys.join(',')}`);
    }
  }
  return { ...SERVER_CFG };
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** PRIVATE API: return the current global configuration object for server */
function SNA_GetServerConfigUnsafe(): DataObj {
  return SERVER_CFG;
}

/// ENABLE CONTEXT HOOK ///////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** internal handler for updating the global configuration */
function HandleUpdateMessage(data: DataObj) {}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: app startup should invoke this during SNA/NET_ACTIVE,
 *  passing the NetEndpoint instance */
function AddMessageHandlers(EP: NetEndpoint) {
  EP.addMessageHandler('SNA/SET_APP_CONFIG', HandleUpdateMessage);
}

/// EXPORTS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export {
  SNA_SetLockState, // set locks state
  SNA_GetLockState, // get lock state
  SNA_SetServerConfig, // set global server config
  SNA_GetServerConfig, // get copy global server config
  // direct access to global config object
  SNA_GetServerConfigUnsafe, // get direct global server config
  //
  AddMessageHandlers // add message handlers
};
