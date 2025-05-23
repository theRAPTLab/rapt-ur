/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  URNET EXPRESS/WS (HTTP) BROWSER CLIENT

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import { ConsoleStyler } from 'ursys/client';
import * as CLIENT from './client-http.ts';

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const PR = ConsoleStyler('AppInit', 'TagPurple');
const LOG = console.log.bind(console);
const DBG = false;

/// RUNTIME ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
(async () => {
  LOG(...PR('Initializing Test of Client HTTP Websocket Connection'));
  await CLIENT.Connect();
  await CLIENT.RegisterMessages();
  CLIENT.Test();
  CLIENT.Start();
  await CLIENT.Disconnect();
  LOG(...PR('Test Complete'));
})();
