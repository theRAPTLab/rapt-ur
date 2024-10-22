/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  SNA-WEB-DATACLIENT is the client-side data manager that mirrors a 
  server-side dataset. It uses URNET network to perform data operations with
  SNA-NODE-DATASERVER

  A Dataset contains several named "bins" of DataBin collections which are
  formally as a bucket with a schema. Datasets are in-memory object stores
  intended for real-time manipulation of data.

  Method Summary

  - Get, Add, Update, Delete, Replace, Init
  - SetRemoteDataAdapter, QueueRemoteDataOp
  - m_ProcessOpQueue

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import { ConsoleStyler } from '../common/util-prompts.ts';
import {
  Hook,
  AddMessageHandler,
  ClientEndpoint,
  RegisterMessages
} from './sna-web.ts';
import { Dataset } from '../common/class-data-dataset.ts';
import { DecodeDataURI, DecodeDataConfig } from '../common/util-data-ops.ts';

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
import type {
  DataObj,
  OpResult,
  RemoteStoreAdapter,
  SyncDataOptions,
  SyncDataReq,
  SyncDataRes,
  UR_Item,
  UR_DatasetURI,
  UR_DatasetObj,
  SearchOptions,
  RecordSet,
  SNA_EvtHandler,
  SNA_Module
} from '../@ur-types.d.ts';
//

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const PR = ConsoleStyler('SNA-DC', 'TagBlue');
const LOG = console.log.bind(console);
const DBG = true;
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
let DSET: Dataset; // singleton instance of the dataset
let DS_URI: UR_DatasetURI; // the dataset URI

/// HELPERS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** receives global config object to initialize local settings */
function m_PreConfigHandler(config: DataObj) {
  const { dataset } = config;
  if (dataset) {
    if (dataset.uri) DS_URI = dataset.uri;
  }
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** opportunity to register hooks before the lifecycle starts */
function m_AddLifecycleHooks() {}

/// DEFAULT SNA-DATASERVER REMOTE ///////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
let F_ReadOnly: boolean = false; // set to true to prevent remote writes
let F_SyncInit: boolean = false; // set to true to sync data on init
let REMOTE: RemoteStoreAdapter; // the remote data adapter
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const LocalAdapter: RemoteStoreAdapter = {
  accToken: '',
  syncData: async (syncReq: SyncDataReq) => {
    const EP = ClientEndpoint();
    if (EP) {
      const res = await EP.netCall('SYNC:SRV_DATA', syncReq);
      return res;
    }
  },
  handleError: (result: OpResult) => {
    return { error: 'no remote data adapter set' };
  }
};
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** 'SYNC:DATA_CLI' handler for incoming data sync messages from dataserver */
function HandleSyncData(sync: SyncDataRes) {
  const { binID, binType, seqNum, status, error, skipped } = sync;
  const { items, updated, added, deleted, replaced } = sync;
  const bin = DSET.getDataBin(binID);

  /*** handle error conditions ***/
  if (bin === undefined) {
    LOG(...PR('ERROR: Bin not found:', binID));
    return;
  }
  if (error) {
    LOG(...PR('ERROR:', error));
    return;
  }
  if (Array.isArray(skipped)) {
    LOG(...PR('ERROR: skipped:', skipped));
    return;
  }
  /*** handle change arrays ***/
  if (Array.isArray(items)) bin.write(items);
  if (Array.isArray(updated)) bin.update(updated);
  if (Array.isArray(added)) bin.add(added);
  if (Array.isArray(deleted)) bin.delete(deleted);
  if (Array.isArray(replaced)) bin.replace(replaced);
}

/// DATASET LOCAL API /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** creates a new Dataset with the associated dsURI but does not perform
 *  any operations.
 *  dataURI looks like 'sri.org:bucket-1234/sna-app/project-one'
 */
async function Configure(dsURI: UR_DatasetURI, opt: SyncDataOptions) {
  const fn = 'SetDataURI:';
  if (DSET !== undefined) throw Error(`${fn} dataset already set`);
  //
  let res: OpResult;
  res = DecodeDataURI(dsURI);
  if (res.error) return { error: `DecodeDataURI ${res.error}` };
  res = DecodeDataConfig(opt);
  if (res.error) return { error: `DecodeDataConfig ${res.error}` };
  const { mode } = res;
  // configure!
  DS_URI = dsURI;
  DSET = new Dataset(DS_URI);
  switch (mode) {
    case 'local':
      F_ReadOnly = false;
      F_SyncInit = false;
      REMOTE = undefined;
      break;
    case 'local-ro':
      F_ReadOnly = true;
      F_SyncInit = false;
      REMOTE = undefined;
      break;
    case 'sync':
      F_ReadOnly = false;
      F_SyncInit = true;
      REMOTE = LocalAdapter;
      break;
    case 'sync-ro':
      F_ReadOnly = true;
      F_SyncInit = true;
      REMOTE = LocalAdapter;
      break;
    default:
      return { error: `unknown mode ${mode}` };
  }
  if (REMOTE) {
    AddMessageHandler('SYNC:CLI_DATA', HandleSyncData);

    await RegisterMessages();
  }
  // return the dataset URI, adapter, messages
  // it's up to the caller to register messages
  return { dsURI, adapter: REMOTE, handlers: ['SYNC:CLI_DATA'] };
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** sets the dataset's content from a UR_DatasetObj. must be called after
 *  Configure() */
async function SetDataFromObject(data: UR_DatasetObj): Promise<OpResult> {
  if (DSET === undefined) return { error: 'must call Configure() first' };
  const { _dataURI } = data;
  if (_dataURI !== DS_URI) return { error: 'dataURI mismatch' };

  // create the bins manually
  const { ItemLists } = data;
  for (const [binID, items] of Object.entries(ItemLists)) {
    LOG(...PR('SetDataFromObject: creating', binID));
    const bin = DSET.createDataBin(binID, 'ItemList');
    bin.write(items);
  }

  /*/ 
  note: implementors of databin (e.g. ItemList) fire notifications
  for data changes, which registed via the Subscribe() API below
  /*/

  // return the dataURI and the list of ItemLists
  return { dataURI: DS_URI, ItemLists: Object.keys(ItemLists) };
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** sets the dataset's content from a UR_DatasetURI. must be called after
 *  Configure() */
async function SetDataFromConfigURI(): Promise<OpResult> {
  const fn = 'LoadDataset:';
  if (DSET === undefined) return { error: 'must call Configure() first' };
  // TODO: load the dataset from the server
  // TODO: handle 'local' and 'sync' modes
  // TODO: hook dataserver updates to the dataset and notify subscribers
}

/// DATASET OPERATIONS ////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function Get(binID: string, ids: string[]): Promise<OpResult> {
  const syncReq: SyncDataReq = { op: 'GET', binID, ids };
  if (REMOTE) {
    const res = await REMOTE.syncData(syncReq);
    return res;
  }
  const bin = DSET.getDataBin(binID);
  if (bin) return bin.get(ids);
  throw Error(`Get: bin ${binID} not found`);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function Add(binID: string, items: UR_Item[]): Promise<OpResult> {
  if (F_ReadOnly) return { error: 'readonly mode' };
  const syncReq: SyncDataReq = { op: 'ADD', binID, items };
  if (REMOTE) {
    const res = await REMOTE.syncData(syncReq);
    return res;
  }
  const bin = DSET.getDataBin(binID);
  if (bin) return bin.add(items);
  throw Error(`Add: bin ${binID} not found`);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function Update(binID: string, items: UR_Item[]): Promise<OpResult> {
  if (F_ReadOnly) return { error: 'readonly mode' };
  const syncReq: SyncDataReq = { op: 'UPDATE', binID, items };
  if (REMOTE) {
    const res = await REMOTE.syncData(syncReq);
    return res;
  }
  const bin = DSET.getDataBin(binID);
  if (bin) return bin.update(items);
  throw Error(`Update: bin ${binID} not found`);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function Write(binID: string, items: UR_Item[]): Promise<OpResult> {
  if (F_ReadOnly) return { error: 'readonly mode' };
  const syncReq: SyncDataReq = { op: 'WRITE', binID, items };
  if (REMOTE) {
    const res = await REMOTE.syncData(syncReq);
    return res;
  }
  const bin = DSET.getDataBin(binID);
  if (bin) return bin.write(items);
  throw Error(`Write: bin ${binID} not found`);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function Delete(binID: string, items: UR_Item[]): Promise<OpResult> {
  if (F_ReadOnly) return { error: 'readonly mode' };
  const syncReq: SyncDataReq = { op: 'DELETE', binID, items };
  if (REMOTE) {
    const res = await REMOTE.syncData(syncReq);
    return res;
  }
  const bin = DSET.getDataBin(binID);
  if (bin) return bin.delete(items);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function DeleteIDs(binID: string, ids: string[]): Promise<OpResult> {
  if (F_ReadOnly) return { error: 'readonly mode' };
  const syncReq: SyncDataReq = { op: 'DELETE', binID, ids };
  if (REMOTE) {
    const res = await REMOTE.syncData(syncReq);
    return res;
  }
  const bin = DSET.getDataBin(binID);
  if (bin) return bin.deleteIDs(ids);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function Replace(binID: string, items: UR_Item[]): Promise<OpResult> {
  if (F_ReadOnly) return { error: 'readonly mode' };
  const syncReq: SyncDataReq = { op: 'REPLACE', binID, items };
  if (REMOTE) {
    const res = await REMOTE.syncData(syncReq);
    return res;
  }
  const bin = DSET.getDataBin(binID);
  if (bin) return bin.replace(items);
  throw Error(`Replace: bin ${binID} not found`);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function Clear(binID: string): Promise<OpResult> {
  if (F_ReadOnly) return { error: 'readonly mode' };
  const syncReq: SyncDataReq = { op: 'CLEAR', binID };
  if (REMOTE) {
    const res = await REMOTE.syncData(syncReq);
    return res;
  }
  const bin = DSET.getDataBin(binID);
  bin.clear();
  if (bin) return {};
  throw Error(`Clear: bin ${binID} not found`);
}

/// SEARCH METHODS ////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** search for matches in the local dataset, which is assumed to be up-to
 *  date if synched mode is set */
async function Find(binID: string, crit?: SearchOptions): Promise<UR_Item[]> {
  const bin = DSET.getDataBin(binID);
  if (bin) return bin.find(crit);
  throw Error(`Find: bin ${binID} not found`);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** use to Find in datasets other than what is configured. good for one-time
 *  queries to remote datasets */
async function DS_RemoteFind(
  dsURI: UR_DatasetURI,
  binID: string,
  crit?: SearchOptions
): Promise<UR_Item[]> {
  return [];
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/* return a RecordSet of items that match the query criteria in the local
 * dataset, which is assumed to be up-to-date if synched mode is set */
async function Query(binID: string, query: SearchOptions): Promise<RecordSet> {
  const bin = DSET.getDataBin(binID);
  if (bin) return bin.query(query);
  throw Error(`Query: bin ${binID} not found`);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** use to Query datasets other than what is configured. good for one-time
 *  queries to remote datasets */
async function DS_RemoteQuery(
  dsURI: UR_DatasetURI,
  binID: string,
  query: SearchOptions
): Promise<RecordSet> {
  return { binID, query, items: [] };
}

/// NOTIFIERS /////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
function Subscribe(binID: string, evHdl: SNA_EvtHandler): OpResult {
  if (typeof binID !== 'string') return { error: 'binID must be a string' };
  if (typeof evHdl !== 'function') return { error: 'evHdl must be a function' };
  if (DSET === undefined) return { error: 'must call Configure() first' };
  const bin = DSET.getDataBin(binID);
  if (bin) {
    bin.on('*', evHdl);
    if (DBG) LOG(...PR('Subscribe:', binID, 'subscribed'));
    return { binID, eventName: '*', success: true };
  }
  if (DBG) LOG(...PR('Subscribe:', binID, 'not found'));
  return { error: `bin ${binID} not found` };
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
function Unsubscribe(binID: string, evHdl: SNA_EvtHandler) {
  if (DSET === undefined) return { error: 'must call Configure() first' };
  const bin = DSET.getDataBin(binID);
  if (bin) bin.off('*', evHdl);
}

/// EXPORTS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const SNA_MODULE: SNA_Module = {
  _name: 'dataclient',
  PreConfig: m_PreConfigHandler,
  PreHook: m_AddLifecycleHooks,
  Subscribe,
  Unsubscribe
};
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export default SNA_MODULE;
export {
  // SNA module methods
  Configure,
  Subscribe,
  Unsubscribe,
  // api data initialization
  SetDataFromObject,
  SetDataFromConfigURI,
  // api data operations
  Get,
  Add,
  Update,
  Write,
  Delete,
  DeleteIDs,
  Replace,
  Clear,
  Find,
  Query
};
