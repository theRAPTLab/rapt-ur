/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  urnet server-related CLI commands
  imported by @api-cli.mts and uses its process.argv

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import PATH from 'node:path';
import * as KV from './kv-json.mts';
import { SpawnOptions, spawn } from 'node:child_process';
import { PROMPTS, PROC, FILE } from 'ursys/server';
import { UDS_INFO, UseServer } from './urnet-constants.mts';

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const DBG = true;
const LOG = PROMPTS.TerminalLog('Process', 'TagCyan');
const DBG_PROC = true;
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const [m_script, m_addon, ...m_args] = PROC.DecodeAddonArgs(process.argv);

/// UTILITY METHODS ///////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** convenience function to get all active entries except the main script */
async function GetActiveHostList() {
  const entries = await KV.GetEntries();
  if (entries.length === 0) return [];
  // the m_script is also in the active host list but we don't include it
  if (entries.length === 1 && entries[0].value === m_script) return [];
  return entries;
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** Delete the script from the process list. Note this is used primarily to
 *  delete the the m_script entry; other process entries have suffixes like
 *  -wss and -uds and are deleted by TerminateServers()
 */
async function RemoveProcessKey(script: string) {
  const entry = await KV.GetEntryByValue(script);
  if (entry === undefined) return;
  const { key } = entry;
  if (key === undefined) {
    LOG.error(`!! ERR ${script} has undefined 'key' property`);
    return;
  }
  await KV.DeleteKey(key);
}

/// API: SERVER METHODS ///////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** Given a server script with listener, spawn a process and save its pid
 *  with identifier. Allow only one such identifier */
async function SpawnServer(scriptName: string, id: string) {
  // make sure that this isn't already in here
  let identifier = `${scriptName}`;
  if (id) identifier = `${identifier} ('${id}')`;
  const found = await KV.GetEntryByValue(identifier);
  if (found) {
    if (DBG)
      LOG.error(`!! server '${identifier}' already running (pid ${found.key})`);
    return;
  }
  // everything looks good, so spawn the process detached
  // net stop will search for detached processes to kill them
  const options: SpawnOptions = {
    detached: true,
    stdio: DBG ? 'inherit' : 'ignore'
  };
  const proc = spawn('tsx', [scriptName, ...m_args], options);
  if (DBG_PROC) LOG(`Spawning ${identifier} with pid:${proc.pid}`);

  const pid = proc.pid.toString();
  await KV.SaveKey(pid, `${identifier}`);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** spawn all communication servers */
async function StartServers() {
  LOG(`Starting Server Processes...`);
  const entries = await GetActiveHostList();
  if (entries.length > 0) {
    LOG.error(`!! server list is not empty...did you crash? use 'ur net stop'`);
    return;
  }
  LOG.warn(`note: To run in background, use 'nohup ur net start &'`);
  LOG.warn(`      Use 'ur net stop' to terminate servers from any console`);
  LOG.warn(`      Use 'tail -f nohup.out' to monitor server output/errors`);

  // main protocol host
  if (UseServer('uds')) await SpawnServer('./serve-uds.mts', 'uds');
  if (UseServer('wss')) await SpawnServer('./serve-wss.mts', 'wss');
  if (UseServer('http')) await SpawnServer('./serve-http.mts', 'http');
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** shutdown all communication servers */
async function TerminateServers() {
  LOG(`Terminating Child Processes...`);
  const entries = await GetActiveHostList();
  if (entries.length === 0) {
    LOG.warn(`!! no running server processes${LOG.RST}`);
    return;
  }
  entries.forEach(async e => {
    const pid = Number(e.key);
    const identifier = e.value;
    if (identifier === m_script) return; // skip main process
    try {
      process.kill(pid, 'SIGTERM');
      const identifier = await KV.DeleteKey(e.key);
      if (DBG_PROC) LOG.info(`.. sending SIGTERM to pid:${pid} ${identifier}`);
    } catch (err) {
      if (err.code === 'ESRCH') {
        LOG(`.. '${e.key}' (pid ${pid}) zombie key removed`);
        await KV.DeleteKey(e.key);
      } else LOG(`** Error sending SIGTERM to process ${pid}:`, err.code);
    }
  });
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** unlink the UDS socket file */
async function UnlinkSocketFiles() {
  const { sock_path } = UDS_INFO;
  const res = await FILE.UnlinkFile(sock_path);
  if (res) LOG(`.. unlinked ${FILE.ShortPath(sock_path)}`, res);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** handle 'net hosts' command */
async function ManageHosts() {
  // kill
  if (m_args.find(a => a === '--kill')) {
    LOG.warn(`killing processes listed in '${PATH.basename(KV.GetJSONFilePath())}'`);
    await TerminateServers();
    await RemoveProcessKey(m_script);
    LOG.warn(`if problems persist, delete file manually`);
    return;
  }
  // otherwise just list them
  const entries = await GetActiveHostList();
  if (entries.length === 0) {
    LOG(`.. no running server hosts`);
    return;
  }
  LOG(`URNET Processes:`);
  entries.forEach(e => {
    LOG(`.. ${e.key}: ${e.value}`);
  });
}

/// EXPORTS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export {
  StartServers,
  TerminateServers,
  ManageHosts,
  //
  GetActiveHostList,
  //
  RemoveProcessKey,
  UnlinkSocketFiles
};
