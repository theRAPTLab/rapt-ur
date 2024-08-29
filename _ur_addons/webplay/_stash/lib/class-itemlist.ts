/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  ItemList Class
  this is a class that manages lists of items in a dataset
  in serializable form

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import { NORM } from '@ursys/core';
const { NormDataItems, NormItemIDs } = NORM;

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
import type {
  UR_EntID,
  UR_NewItem,
  UR_Item,
  UR_ItemList
} from '../../../../_ur/_types/dataset.d.ts';
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
type ItemListOptions = {
  idPrefix: string; // required
  startOrd?: number; // starting number (default 0)
  ordDigits?: number; // number of digits (default 3)
};

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const DBG = false;
const LOG = console.log.bind(console);

/// CLASS DECLARATION //////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
class ItemList {
  //
  collection_name: string;
  collection_type: string;
  _list: UR_ItemList;
  _max_ord: number;
  _prefix: string;
  _ord_digits: number;
  //
  constructor(col_name: string, opt?: ItemListOptions) {
    const fn = 'ItemList:';
    this._list = [];
    this.collection_type = this.constructor.name;
    let { idPrefix, startOrd, ordDigits } = opt || {};
    if (col_name === undefined) throw Error(`${fn} collection name is required`);
    // required
    if (idPrefix === undefined) idPrefix = '';
    if (typeof idPrefix !== 'string')
      throw Error(`${fn} idPrefix must be a string when specified`);
    this._prefix = idPrefix || ''; // default to no prefix
    // optional
    this._ord_digits = ordDigits || 3;
    this._max_ord = startOrd || 0;
  }

  /// LIST ID METHODS ///
  /// note: these are slow routines that could be cached for performance if listmanager is
  /// split into two classes

  /** decode an id into its _prefix and number */
  decodeID(id: UR_EntID): [string, number] {
    const fn = 'decodeID:';
    // get the part of id after _prefix
    if (!id.startsWith(this._prefix))
      throw Error(`${fn} id ${id} does not match _prefix ${this._prefix}`);
    const ord = id.slice(this._prefix.length);
    return [this._prefix, parseInt(ord)];
  }

  /** find the highest id in the _list. EntityIDs are _prefix string + padded number, so
   *  we can just sort the _list and return the last one */
  newID(): UR_EntID {
    const fn = 'findMaxID:';
    // do we already know the
    if (this._max_ord > 0) {
      const idstr = (++this._max_ord).toString().padStart(this._ord_digits, '0');
      return `${this._prefix}${idstr}`;
    }
    // otherwise, we need to find it
    let maxID = 0;
    for (const li of this._list) {
      const [_prefix, ord] = this.decodeID(li._id);
      if (ord > maxID) maxID = ord;
    }
    this._max_ord = maxID;
    const idstr = (++this._max_ord).toString().padStart(this._ord_digits, '0');
    return `${this._prefix}${idstr}`;
  }

  /// LIST METHODS ///

  /** given the name of a _list and an array of objects, add the objects to the
   *  _list and return the _list if successful, undefined otherwise */
  add(items: UR_NewItem[]): UR_Item[] {
    const fn = 'listAdd:';
    if (!Array.isArray(items)) throw Error(`${fn} items must be array of objects`);
    if (items.length === 0) throw Error(`${fn} items array is empty`);
    // make sure that items do not have _id fields and assign new ones
    const copies = items.map(item => ({ ...item }));
    for (let item of copies) {
      if (item._id !== undefined)
        throw Error(`${fn} item already has an _id ${item._id}`);
      item._id = this.newID();
    }
    // add the items to the _list
    // make sure that the _list doesn't have these items already
    for (let item of items) {
      if (this._list.find(obj => obj._id === item._id))
        throw Error(`${fn} item ${item._id} already exists in _list`);
    }
    // add the items to the _list
    this._list.push(...(copies as UR_Item[]));
    return [...this._list]; // return a copy of the _list
  }

  /** Given the name of a _list, return the entire _list or the subset of ids
   *  identified in the ids array, in order of the ids array. Return a COPY
   *  of the objects, not the original objects */
  read(ids?: UR_EntID[]): UR_Item[] {
    const fn = 'listRead:';
    // if no ids are provided, return the entire _list
    if (ids === undefined) {
      return [...this._list]; // return a copy of the _list
    }
    // otherwise, return the specific objects in the order of the ids array
    // as a copy of the objects
    return ids.map(id => this._list.find(obj => obj._id === id));
  }

  /** Given the name of a _list, update the objects in the _list with the items
   *  provided through shallow merge. If there items that don't have an _id field
   *  or if the _id field doesn't already exist in the _list, throw an Error.
   *  Return a copy of _list if successful */
  update(items: UR_Item[]) {
    const fn = 'listUpdate:';
    if (!Array.isArray(items) || items === undefined)
      throw Error(`${fn} items must be an array`);
    if (items.length === 0) throw Error(`${fn} items array is empty`);
    const [norm_items, norm_error] = NormDataItems(items);
    if (norm_error) throw Error(`${fn} ${norm_error}`);
    // got this far, items are normalized and we can merge them.
    for (const item of norm_items) {
      const idx = this._list.findIndex(obj => obj._id === item._id);
      if (idx === -1) throw Error(`${fn} item ${item._id} not found in _list`);
      Object.assign(this._list[idx], item);
    }
    return [...this._list]; // return a copy of the _list
  }

  /** Given the name of a _list, overwrite the objects. Unlike ListUpdate, this
   *  will not merge but replace the items. The items must exist to be
   *  replaced */
  replace(items: UR_Item[]) {
    const fn = 'listReplace:';
    if (!Array.isArray(items) || items === undefined)
      throw Error(`${fn} items must be an array`);
    if (items.length === 0) throw Error(`${fn} items array is empty`);
    const [norm_items, norm_error] = NormDataItems(items);
    if (norm_error) throw Error(`${fn} ${norm_error}`);
    // got this far, items are normalized and we can overwrite them.
    const replaced = [];
    for (const item of norm_items) {
      const idx = this._list.findIndex(obj => obj._id === item._id);
      if (idx === -1) throw Error(`${fn} item ${item._id} not found in _list`);
      const old_obj = { ...this._list[idx] };
      replaced.push(old_obj);
      this._list[idx] = item;
    }
    return replaced; // return a copy of the _list
  }

  /** Given the name of a _list, add the items to the _list. If an already
   *  exists in the _list, update it instead. Return a copy of the _list */
  write(items: UR_Item[]) {
    const fn = 'listWrite:';
    const added = [];
    const updated = [];
    // update the items that already exist in the _list
    for (const item of items) {
      const idx = this._list.findIndex(obj => obj._id === item._id);
      if (idx === -1) {
        this._list.push(item);
        added.push({ ...item });
      } else {
        Object.assign(this._list[idx], item);
        updated.push({ ...this._list[idx] });
      }
    }
    return { added, updated }; // return a copy of the _list
  }

  /** Given the name of a _list, delete the objects in the _list with the ids
   *  provided. If there are any ids that don't exist in the _list, throw an
   *  Error. Return a copy of the deleted items if successful */
  delete(ids: UR_EntID[]) {
    const fn = 'listDelete:';
    if (!Array.isArray(ids) || ids === undefined)
      throw Error(`${fn} ids must be an array of _id strings`);
    const [del_ids, del_error] = NormItemIDs(ids);
    if (del_error) throw Error(`${fn} ${del_error}`);
    // got this far, ids are normalized and we can delete them
    const deleted = [];
    for (const id of del_ids) {
      const idx = this._list.findIndex(obj => obj._id === id);
      if (idx === -1) throw Error(`${fn} item ${id} not found in _list`);
      deleted.push(this._list[idx]);
      this._list.splice(idx, 1);
    }
    return deleted; // return a copy of the _list
  }

  /** erase all the entries in the _list, but do not reset the max_ord or _prefix */
  clear() {
    this._list = [];
  }

  /** alternative getter */
  getItems() {
    return this.items;
  }

  /** getter for the _list, returning a copy */
  get items() {
    return [...this._list];
  }
}

/// EXPORTS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export default ItemList; // the class
export {
  ItemList // the class
};
export type { ItemListOptions }; // the options type
