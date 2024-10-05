/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  DataSet is a storage class for managing different "bins" of the same type
  of collection.

  class Dataset
    getDataBin, getDataBinByType, 
    createDataBin, deleteDataBin, openDataBin, closeDataBin
    createItemList, clearItemList, getItemList
    createDocFolder, clearDocFolder, getDocFolder

  A "bin" is a named collection that is stored in the dataset. A dataset
  is associated with a home location called a "bucket". 

  Bins are instances of DataBin, which exposes the following methods:
    add, read, update, replace, write, deleteIDs, delete, clear, getItems
    find, query
    on, off
    serializeToJSON, deserializeFromJSON

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import { NORM } from '@ursys/core';
import { ItemList } from './class-data-itemlist.ts';
import { DataBin } from './class-data-itemset.ts';

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
import type { DataBinID, DataBinType, UR_SchemaID } from '../_types/dataset';
import type { ItemListOptions } from './class-data-itemlist.ts';

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const DBG = false;
const LOG = console.log.bind(console);
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const CTYPES = ['DocFolder', 'ItemList']; // mirror DataBinType

/// HELPER METHODS ////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** return true if the given bag type is recognized */
function m_IsValidBinType(cType: DataBinType): boolean {
  return CTYPES.includes(cType);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** conform bag names to be snake case and is only lower case */
function m_IsValidBinName(bName: string): boolean {
  const noSpaces = !/\s/.test(bName);
  const snakeCase = /^[a-z_]+$/.test(bName);
  return noSpaces && snakeCase;
}

/// CLASS DECLARATION //////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** knows how to manage the different kinds of collections */
class DataSet {
  //
  dataset_name: string; // the name of this list manager
  dataset_schema: UR_SchemaID; // the schema of the dataset
  open_bins: Set<DataBinID>; // open bins are subject to sync
  //
  LISTS: { [ref_name: DataBinID]: ItemList };
  // see https://github.com/dsriseah/ursys/discussions/25 for other bin types
  // docfolders
  // files
  // state
  // logs
  // templates
  // config

  /// CONSTRUCTOR ///

  constructor(dsname: string) {
    if (dsname && m_IsValidBinName(dsname)) this.dataset_name = dsname;
    this._init();
  }

  /** private: initialize the dataset */
  _init() {
    this.open_bins = new Set();
    this.LISTS = {};
  }

  /** private: mark a bin as open */
  _markBinOpen(binName: DataBinID) {
    const fn = '_markBinOpen:';
    if (this.open_bins.has(binName))
      throw Error(`${fn} bin '${binName}' is already open`);
    this.open_bins.add(binName);
  }

  /** private: mark a bin as closed */
  _markBinClosed(binName: DataBinID) {
    const fn = '_markBinClosed:';
    if (!this.open_bins.has(binName))
      throw Error(`${fn} bin '${binName}' is already closed`);
    this.open_bins.delete(binName);
  }

  /// UNIVERSAL BIN METHODS ///

  /** API: Given a bin name, return the bin. Since bin names are unique, this
   *  method will return just one bin. */
  getDataBin(binName: DataBinID, binType?: DataBinType): DataBin {
    const fn = 'openDataBin:';
    // if binType is passed, use that for lazy API
    if (binType && m_IsValidBinType(binType))
      return this.getDataBinByType(binName, binType);
    // otherwise look for the bins
    let bin: DataBin;
    // search first bin
    bin = this.LISTS[binName];
    // search subsequent bins...
    if (bin === undefined) throw Error(`${fn} bin '${binName}' not found`);
    return bin;
  }

  /** API: Given a bin name and type, return the bin. */
  getDataBinByType(binName: DataBinID, binType: DataBinType): DataBin {
    const fn = 'openBinByType:';
    let bin: DataBin;
    switch (binType) {
      case 'ItemList':
        bin = this.getItemList(binName);
        break;
      default:
        throw Error(`${fn} bin type '${binType}' not recognized`);
    }
    return bin;
  }

  /** API: create a new bin by name and type. */
  createDataBin(binName: DataBinID, binType: DataBinType): DataBin {
    const fn = 'createDataBin:';
    let bin: DataBin;
    switch (binType) {
      case 'ItemList':
        bin = this.createItemList(binName);
        break;
      default:
        throw Error(`${fn} bin type '${binType}' not recognized`);
    }
    return bin;
  }

  /** API: close a bin by name */
  deleteDataBin(binName: DataBinID): void {
    const fn = 'closeDataBin:';
    if (this.LISTS[binName] === undefined)
      throw Error(`${fn} bin '${binName}' not found`);
    delete this.LISTS[binName];
  }

  // track open vs closed bins (speculative need)

  /** API: Given a bin name, return the bin. Since bin names are unique, this
   *  method will return just one bin. */
  openDataBin(binName: DataBinID, binType?: DataBinType): DataBin {
    let bin: DataBin = this.getDataBin(binName, binType);
    this._markBinOpen(binName);
    return bin;
  }

  /** API: close bin */
  closeDataBin(binName: DataBinID): DataBinID {
    const fn = 'closeDataBin:';
    if (!this.open_bins.has(binName))
      throw Error(`${fn} bin '${binName}' not opened`);
    this._markBinClosed(binName);
    return binName;
  }

  /// ITEM LIST METHODS ///

  /** Given the name of a list, create a new list and return the list
   *  instance */
  createItemList(listName: string, opt?: ItemListOptions): ItemList {
    const fn = 'createItemList:';
    if (this.LISTS[listName] !== undefined)
      throw Error(`${fn} list '${listName}' already exists`);
    const list = new ItemList(listName, opt);
    this.LISTS[listName] = list;
    return this.LISTS[listName];
  }

  /** Given the name of a list, clear the list of all items and retain the
   *  same list instance and max ordinal count */
  clearItemList(listName: string): ItemList {
    const fn = 'clearItemList:';
    const list = this.LISTS[listName];
    if (list === undefined) throw Error(`${fn} list '${listName}' not found`);
    list.clear();
    return list;
  }

  /** Given the name of a list, return the entire list */
  getItemList(listName: string): ItemList {
    const fn = 'getItemList:';
    const list = this.LISTS[listName];
    if (list === undefined) throw Error(`${fn} list '${listName}' not found`);
    return list;
  }

  /// DOC FOLDER METHODS ///

  /** Given the name of a folder, create a new folder and return the folder
   *  instance */
  createDocFolder(folderName: string) {}
  clearDocFolder(folderName: string) {}
  getDocFolder(folderName: string) {}
}

/// EXPORTS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export default DataSet; // the class
export {
  DataSet // the class
};
