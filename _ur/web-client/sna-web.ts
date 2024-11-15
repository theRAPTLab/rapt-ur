/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  Sri's New Architecture (SNA) Main Client Component

  This can be imported by user components to start the SNA lifecyle on the
  client side. It uses the MSG network to communicate with the server.

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import { ConsoleStyler } from '../common/util-prompts.ts';
import {
  SNA_NetConnect,
  AddMessageHandler,
  RegisterMessages
} from './sna-web-urnet-client.ts';
import {
  SNA_RegisterComponent,
  SNA_GlobalConfig,
  SNA_LifecycleStart,
  SNA_LifecycleStatus,
  SNA_Hook,
  GetDanglingHooks
} from './sna-web-hooks.ts';

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const LOG = console.log.bind(console);
const PR = ConsoleStyler('SNA', 'TagCyan');

/// SNA LIFECYCLE /////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: initialize the server's lifecycle */
async function SNA_Start() {
  // get configuration flags
  const { no_urnet, no_hmr } = SNA_GlobalConfig();
  if (no_urnet) {
    LOG(...PR('** Offline Mode **'));
    return;
  } else {
    // prepare net hooks before starting the lifecycle
    SNA_Hook('DOM_READY', SNA_NetConnect);
    SNA_Hook('NET_DECLARE', async (p, m) => {
      await RegisterMessages();
    });
  }
  if (no_hmr) {
    LOG(...PR('** Hot Reload Disabled **'));
  } else {
    SNA_Hook('NET_CONNECT', async (p, m) => {
      AddMessageHandler('NET:UR_HOT_RELOAD_APP', () => {
        LOG(...PR('Hot Reload Requested'));
        window.location.reload();
      });
    });
  }
  // log when the app is running
  SNA_Hook('APP_RUN', () => {
    LOG(...PR('App Running'));
  });

  // now start the lifecycle
  await SNA_LifecycleStart();
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: retrieve SNA status object */
function SNA_Status() {
  const dooks = GetDanglingHooks();
  const status = SNA_LifecycleStatus();
  return {
    dooks,
    ...status
  };
}

/// SNA MODULES PACKAGING /////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/// remember to import default, which has _name property set
import MOD_DataClient from './sna-dataclient.ts';

/// EXPORTS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export {
  // sna process
  SNA_RegisterComponent as RegisterComponent,
  SNA_GlobalConfig as GlobalConfig,
  SNA_Start as Start,
  SNA_Status as Status,
  SNA_Hook as Hook,
  // sna modules
  MOD_DataClient
};
export {
  // phase machine static methods
  HookPhase,
  RunPhaseGroup,
  GetMachine,
  GetDanglingHooks
} from './sna-web-hooks.ts';
export {
  // urnet static methods
  AddMessageHandler,
  DeleteMessageHandler,
  RegisterMessages,
  ClientEndpoint
} from './sna-web-urnet-client.ts';
