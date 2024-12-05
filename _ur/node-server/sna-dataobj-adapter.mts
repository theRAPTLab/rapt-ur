/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  DATA OBJECT ADAPTERS are the bridge between the SNA Dataset API and the
  underlying data storage mechanism. The DataObjAdapter class is the
  reference implementation of the Dataset Adapter for a filesystem-based

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import * as FILE from './file.mts';
import * as PATH from 'node:path';
import {
  DecodeDataURI,
  IsAssetDirname,
  GetBinTypeByDirname
} from '../common/util-data-ops.ts';
import { DataObjAdapter } from '../common/abstract-dataobj-adapter.ts';

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
import type { DOA_Options } from '../common/abstract-dataobj-adapter.ts';
import type {
  DS_DatasetObj,
  DS_DataURI,
  UR_ManifestObj,
  DataBinID,
  DatasetInfo
} from '../_types/dataset.js';

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const MANIFEST_FILENAME = '00-manifest';
let manifest_id_counter = 1000; // asset id counter

/// ADAPTER FUNCTIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** return an array of manifest objects read from predefined manifest files */
async function m_GetPredefinedManifests(dataPath: string) {
  const allfiles = FILE.Files(dataPath);
  const mfiles = allfiles
    .filter(f => f.startsWith(MANIFEST_FILENAME) && f.endsWith('.json'))
    .sort();
  // case 1: 1 more more manifest files exist
  if (mfiles.length > 0) {
    const manifestObjs = [];
    for (let f of mfiles) {
      const obj = FILE.ReadJSON(`${dataPath}/${f}`);
      manifestObjs.push({ manifest: obj, manifest_src: f });
    }
    return manifestObjs;
  }
  // case 2: no manifest files found
  return [];
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function m_GetDirFilesInfo(assetPath: string) {
  const files = FILE.Files(assetPath, { absolute: true });
  const info = await FILE.FilesHashInfo(files);
  return info;
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function m_GetDataBinEntries(dataPath, assetPath) {
  const subdirPath = PATH.join(dataPath, assetPath);
  const filesInfo = await m_GetDirFilesInfo(subdirPath);
  const entries = [];
  for (let info of filesInfo) {
    const { filename, basename, ext, hash } = info;
    const asset = {
      name: basename,
      ext: ext,
      type: GetBinTypeByDirname(assetPath),
      uri: `${assetPath}/${filename}`,
      hash: hash
    };
    entries.push(asset);
  }
  return entries;
}

/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** scan the dataPath for asset directories and generate a manifest object */
async function m_GetDataBinManifest(dataPath: string) {
  const raw_manifest = {};
  const { dirs } = FILE.GetDirContent(dataPath);
  const assetDirs = dirs.filter(d => IsAssetDirname(d)); // lowercase dirs
  if (assetDirs.length === 0) {
    console.log('*** no asset directories found in', dataPath);
    return undefined;
  }
  // process each asset directory
  for (const assetDir of assetDirs) {
    switch (assetDir) {
      case 'itemlists':
      case 'itemdicts':
        raw_manifest[assetDir] = await m_GetDataBinEntries(dataPath, assetDir);
        break;
      default:
        throw Error(`unimplemented asset processor for: ${assetDir}`);
    }
  } // end subdir processing
  return raw_manifest;
}

/// API HELPERS ///////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: generate a manifest from the passed dataPath */
async function GetManifestFromPath(dataPath: string, meta?: UR_ManifestObj) {
  // bail if the requested path isn't a directory
  const pathInfo = FILE.GetPathInfo(dataPath);
  if (pathInfo.isFile)
    return { error: `${dataPath} appears to be a file request, not a directory` };
  if (FILE.DirExists(dataPath)) {
    /* is there an predefined manifest file? */
    const manifestObjs = await m_GetPredefinedManifests(dataPath);
    if (manifestObjs.length > 0) return manifestObjs[0];
    /* otherwise, generate the manifest from dataPath */
    const dataManifest = await m_GetDataBinManifest(dataPath);
    if (typeof meta !== 'object') meta = {};
    const manifest = Object.assign(meta, dataManifest);
    return { manifest, manifest_src: 'auto-generated' };
  }
  return { error: `${dataPath} does not exist` };
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** HELPER: return the path from a dataURI, optionally prepending root
 *  dir if provided and valid */
function MakePathFromDataURI(dataURI: DS_DataURI, rootDir?: string): string {
  const { orgDomain, bucketID, instanceID } = DecodeDataURI(dataURI);
  const orgPath = orgDomain;
  const bucketPath = bucketID;
  // construct
  const dataPath = PATH.join(orgPath, bucketPath, instanceID);
  if (rootDir === undefined) return dataPath;
  if (typeof rootDir !== 'string') throw Error('rootDir must be a string');
  if (FILE.DirExists(rootDir)) return PATH.join(rootDir, dataPath);
  throw Error(`MakePathFromDataURI: rootDir ${rootDir} does not exist`);
}

/// DATA STORAGE ADAPTER //////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
type ExtOptions = DOA_Options & { dataDir: string };
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
class SNA_DataObjAdapter extends DataObjAdapter {
  //
  data_dir: string; // root data directory

  /// INITIALIZERS ///

  constructor(opt?: ExtOptions) {
    super(opt);
    if (opt?.dataDir) this.setDataDir(opt?.dataDir);
  }

  /// IMPLEMENTATION-SPECIFIC METHODS ///

  /** extended method to set the data directory for this filesystem-based
   *  data object adapter */
  setDataDir(dataDir: string) {
    if (typeof dataDir !== 'string') {
      throw new Error('dataDir must be a string');
    }
    if (!FILE.DirExists(dataDir)) {
      throw new Error(`dataDir ${dataDir} does not exist`);
    }
    this.data_dir = dataDir;
  }

  /// ABSTRACT API METHOD IMPLEMENTATION ///

  /** returns manifest object from the filesystem */
  async getDatasetInfo(dataURI: DS_DataURI): Promise<DatasetInfo> {
    if (this.data_dir === undefined) {
      throw Error(`getDatasetInfo: data_dir not set`);
    }
    const dataPath = MakePathFromDataURI(dataURI, this.data_dir);
    // 4. read manifest from filesystem
    const { manifest, manifest_src, error } = await GetManifestFromPath(dataPath, {
      _dataURI: dataURI,
      _meta: {
        author: 'sna-dataobj-adapter',
        create_time: new Date().toISOString(),
        description: 'auto-generated manifest'
      }
    });
    if (error) return { error };
    return { manifest, manifest_src, _dataURI: dataURI };
  }

  /** read dataset object from the filesystem */
  async readDatasetObj(dataURI: string) {
    // console.log('DatasetFS: GetData');
    // dummy hardcoded load
    const rootDir = FILE.DetectedRootDir();
    const dataPath = PATH.join(rootDir, '_ur/tests/data/');
    const jsonFile = PATH.join(dataPath, 'mock-dataset.json');
    const data = FILE.ReadJSON(jsonFile);
    return data;
  }

  /** read databin object from the filesystem */
  async readDataBinObj(dataURI: string, binID: DataBinID) {
    console.log('would get databin obj');
    return {};
  }

  /** write dataset object to the filesystem */
  async writeDatasetObj(dataURI: string, dsObj: DS_DatasetObj) {
    console.log('would save dataset');
    return {};
  }

  /** write databin object to the filesystem */
  async writeDataBinObj(dataURI: string, binID: DataBinID, dataObj: any) {
    console.log('would save databin obj');
    return {};
  }
}

/// EXPORTS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export default SNA_DataObjAdapter;
export { SNA_DataObjAdapter };
