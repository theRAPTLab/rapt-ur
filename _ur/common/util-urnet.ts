/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  URNET Type Conformance Utilities

  This file contains the types used by NetEndpoint and NetPacket.
  The NetEndpoint class is the main interface for sending and receiving
  NetPackets. NetPackets are the encapsulated messages that are sent.

  Type Concepts:

  MSG Messages  - made of CHANNEL and a NAME, e.g. 'NET:HELLO_WORLD'
  ADDR Address  - every endpoint has an address, e.g. 'UR_001'
  NP NetPacket  - NetPacket-related types, e.g. NP_ID, NP_Chan, NP_Msg
  EP Endpoint   - Endpoint-related type are in class-urnet-endpoint.ts
  PKT Packet    - shorthand for NetPacket

  CROSS PLATFORM USAGE --------------------------------------------------------

  When using from nodejs mts file, you can only import functions from 'default',
  so to access the NetPacket class do this:

    import UR_TYPES from './my-types.ts';
    const { AllocateAddress } = UR_TYPES.default; // note .default

  You can import the types as usual, though:

    import UR_TYPES, { NP_Msg, NP_Data } from './my-types.ts';

  This is not required when importing from another .ts typescript file
  such as class-urnet-endpoint.ts.

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

/// TYPE IMPORTS //////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
import type {
  NP_Chan,
  NP_Type,
  NP_Msg,
  NP_Data,
  NP_Hash,
  NP_Address,
  NP_AddrPre,
  I_NetMessage
} from '../_types/urnet.d.ts';

/// RUNTIME UTILITIES /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** note: these runtime checks have mirrored declarations in ursys.d.ts **/
const VALID_MSG_CHANNELS = ['SYNC', 'NET', 'SRV', 'LOCAL', ''] as const;
const VALID_PKT_TYPES = [
  'ping',
  'signal',
  'send',
  'call',
  '_auth', // special packet
  '_reg', // special packet
  '_decl' // special packet
] as const;
const VALID_ADDR_PREFIX = ['???', 'UR_', 'WSS', 'UDS', 'MQT', 'SRV'] as const;
const SKIP_SELF_PKT_TYPES = ['call', 'send'];
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const UADDR_DIGITS = 3; // number of digits in UADDR (padded with 0)
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const USED_ADDRS = new Set<NP_Address>();
// make string foo with a number of zeros equal to UADDR_DIGITS length
const zeroPad = `0`.padStart(UADDR_DIGITS, '0');
const UADDR_NONE = `???${zeroPad}` as NP_Address; // unroutable address

/// FUNCTION SIGNATURES ///////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** runtime check of NP_Type */
function IsValidType(msg_type: string): boolean {
  return VALID_PKT_TYPES.includes(msg_type as NP_Type);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** some message types should not invoke back to the same pkt origin
 *  returning true 'call' and 'send'
 */
function SkipOriginType(msg_type: string): boolean {
  return SKIP_SELF_PKT_TYPES.includes(msg_type as NP_Type);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** runtime check of protocol-related NP_Type */
function isSpecialPktType(msg_type: string): boolean {
  if (!IsValidType(msg_type)) return false;
  return msg_type.startsWith('_');
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** runtime check of NP_Chan */
function IsValidChannel(msg_chan: string): boolean {
  return VALID_MSG_CHANNELS.includes(msg_chan as NP_Chan);
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** runtime check of NP_Address */
function IsValidAddress(addr: string): boolean {
  if (typeof addr !== 'string') return false;
  let prelen = 0;
  if (
    !VALID_ADDR_PREFIX.some(pre => {
      prelen = pre.length;
      return addr.startsWith(pre);
    })
  )
    return false;
  const num = parseInt(addr.slice(prelen));
  if (isNaN(num)) return false;
  return true;
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** runtime check of NP_Msg, returns array if good otherwise it returns undefined */
function IsValidMessage(msg: NP_Msg): [NP_Chan, string] {
  try {
    return DecodeMessage(msg);
  } catch (err) {
    console.log(err.message);
    console.log(err.stack.split('\n').slice(1).join('\n').trim());
    return undefined;
  }
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** runtime create formatted address */
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
let ADDR_MAX_ID = 0;
type AllocateOptions = { prefix?: NP_AddrPre; addr?: NP_Address };
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** allocate a new address, optionally with a label */
function AllocateAddress(opt?: AllocateOptions): NP_Address {
  const fn = 'AllocateAddress';
  let addr = opt?.addr; // manually-set address
  let pre = opt?.prefix || 'UA'; // address prefix
  if (addr === undefined) {
    // generate a new address
    let id = ++ADDR_MAX_ID;
    let padId = `${id}`.padStart(UADDR_DIGITS, '0');
    addr = `${pre}${padId}` as NP_Address;
  } else if (USED_ADDRS.has(addr)) {
    // the manually-set address is already in use
    throw Error(`${fn} - address ${addr} already allocated`);
  }
  USED_ADDRS.add(addr);
  return addr;
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** given a CHANNEL:MESSAGE string, return the channel and message name in
 *  an array */
function DecodeMessage(msg: NP_Msg): [NP_Chan, string] {
  if (typeof msg !== 'string') throw Error(`message must be string: ${msg}`);
  if (msg !== msg.toUpperCase()) throw Error(`message must be uppercase: ${msg}`);
  if (msg.endsWith('_')) throw Error(`message can not end with _: ${msg}`);
  const bits = msg.split(':');
  if (bits.length === 0) throw Error(`invalid empty message`);
  if (bits.length > 2) throw Error(`invalid channel:message format ${msg}`);
  let [chan, name] = bits;
  if (bits.length === 1) {
    name = chan;
    chan = 'LOCAL';
  }
  if (chan === '') chan = 'LOCAL';
  if (!IsValidChannel(chan))
    throw Error(`prefix must be ${VALID_MSG_CHANNELS.join(' ').trim()} not ${chan}`);
  return [chan as NP_Chan, name];
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** make sure that the message is always consistent. Officially, a local
 *  message begins with : and a network message begins with NET:
 */
function NormalizeMessage(msg: NP_Msg): NP_Msg {
  let [chan, name] = DecodeMessage(msg);
  if (chan === 'LOCAL') chan = '';
  return `${chan}:${name}`;
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** make sure that degenerate arrays turn into single object */
function NormalizeData(data: NP_Data): NP_Data {
  // if not an array just return as-is
  if (!Array.isArray(data)) return data;
  // no handlers for empty array
  if (data.length === 0) return undefined;
  // replace undefined with empty object
  for (let i = 0; i < data.length; i++) if (data[i] === undefined) data[i] = {};
  // if only one element, return it as a single object
  if (data.length == 1) return data[0];
  // otherwise return the normalized array
  return data;
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** return true if message is a local request */
function IsLocalMessage(msg: NP_Msg): boolean {
  const [chan] = DecodeMessage(msg);
  return chan === 'LOCAL';
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** return true if message is a network request */
function IsNetMessage(msg: NP_Msg): boolean {
  const [chan] = DecodeMessage(msg);
  return chan === 'NET' || chan === 'SRV' || chan === 'SYNC';
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** return true if message is implemented by main URNET server */
function IsServerMessage(msg: NP_Msg): boolean {
  const [chan] = DecodeMessage(msg);
  return chan === 'SRV' || chan === 'SYNC';
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** given a packet, return a unique hash string */
function GetPacketHashString(pkt: I_NetMessage): NP_Hash {
  return `${pkt.src_addr}:${pkt.id}`;
}

/// EXPORTS /////////////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export {
  IsValidType,
  SkipOriginType,
  isSpecialPktType,
  IsValidChannel,
  IsValidAddress,
  IsValidMessage,
  AllocateAddress,
  DecodeMessage,
  NormalizeMessage,
  NormalizeData,
  IsLocalMessage,
  IsNetMessage,
  IsServerMessage,
  GetPacketHashString
};
export {
  VALID_MSG_CHANNELS,
  VALID_PKT_TYPES,
  VALID_ADDR_PREFIX,
  SKIP_SELF_PKT_TYPES,
  UADDR_DIGITS,
  UADDR_NONE
};
