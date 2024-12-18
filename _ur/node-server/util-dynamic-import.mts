/*///////////////////////////////// ABOUT \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*\

  URSYS Bare Module Template
  - for detailed example, use snippet 'ur-module-example' instead

\*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\ * /////////////////////////////////////*/

import FS from 'node:fs';
import PATH from 'node:path';
import { makeTerminalOut, ANSI } from '../common/util-prompts.ts';
import { DetectedRootDir, AbsLocalPath } from './file.mts';

/// TYPE DECLARATIONS /////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

/// CONSTANTS & DECLARATIONS //////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const LOG = makeTerminalOut('DIMPORT', 'TagCyan');
const DBG = true;
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
const { BLU, YEL, RED, DIM, NRM } = ANSI;

/// API METHODS ///////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: import all server modules in the provided directory. Ignores files
 *  that are in subdirectories (useful for hiding). */
async function ImportServerModules(absSrcDir: string): Promise<string[]> {
  const fn = 'ImportServerModules:';
  if (!FS.existsSync(absSrcDir)) {
    LOG(`${RED}${fn} Source directory not found: ${absSrcDir}${NRM}`);
    return [];
  }
  try {
    const mtsFilter = file => file.endsWith('.mts');
    const mtsFiles = (await FS.promises.readdir(absSrcDir)).filter(mtsFilter);
    // load mts modules
    for (const file of mtsFiles) {
      const absFile = PATH.join(absSrcDir, file);
      await import(absFile);
    }
    // return the list of imported files
    return mtsFiles;
  } catch (error) {
    if (error.message.includes(`find package '_ur`))
      LOG(`${RED}${fn} SNA dynamic modules can not use path aliases${NRM}`);
    throw Error(`${fn} Error during dynamic import: ${error.message}`);
  }
}
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
/** API: write a temp file that imports client modules that can be used as
 *  the entry point for a web bundler. */
async function ImportClientModules(
  srcDir: string
): Promise<{ entryFile: string; tsFiles: string[] }> {
  const fn = 'ImportClientModules:';
  if (!FS.existsSync(srcDir)) {
    LOG(`${RED}${fn} Source directory not found: ${srcDir}${NRM}`);
    return undefined;
  }
  try {
    const tsFilter = file => file.endsWith('.ts') && !file.startsWith('_');
    const clientFiles = (await FS.promises.readdir(srcDir)).filter(tsFilter);
    let out = `// autogenerated by sna dynamic importer\n`;
    for (const file of clientFiles) out += `import './${file}';\n`;
    const outFile = '__app_imports.ts';
    const outPath = PATH.join(srcDir, outFile);
    await FS.promises.writeFile(outPath, out);
    return { entryFile: outFile, tsFiles: clientFiles };
  } catch (error) {
    if (error.message.includes(`find package '_ur`))
      LOG(`${RED}${fn} SNA dynamic modules can not use path aliases${NRM}`);
    throw Error(`${fn} Error during dynamic import: ${error.message}`);
  }
}

/// EXPORTS ///////////////////////////////////////////////////////////////////
/// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export {
  ImportServerModules, // import all server modules in the provided directory
  ImportClientModules // write a temp file that imports client modules
};
