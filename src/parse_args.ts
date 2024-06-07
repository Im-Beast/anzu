// Copyright 2024 Im-Beast. All rights reserved. MIT license.
export interface ParsedArgs {
  [key: string]: string[];
}

/**
 * Parse arguments to easy to use key-value format
 * @param args - e.g. Deno.args
 */
export function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  let key;
  for (const arg of args) {
    if (arg.includes("\n")) console.log("woah!");

    if (/^--?.+$/.test(arg)) {
      key = arg;
      parsed[key] ||= [];
      continue;
    }

    if (!key) {
      throw new Error(
        "Failed parsing arguments, missing key for given option",
      );
    }

    parsed[key].push(arg);
  }

  return parsed;
}
