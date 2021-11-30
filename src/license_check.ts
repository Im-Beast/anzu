// Copyright 2021 Im-Beast. All rights reserved. MIT license.
import { cyan, gray, green, red, white, yellow } from "./deps.ts";

let permissionDelay = 0;

interface ResearchDirectoryOptions {
  /** Starting path */
  path: string;
  /** Pattern that files have to match */
  fileRegexp: RegExp;
  /** Pattern that files cannot match */
  excludeFileRegexp?: RegExp;
  /** Pattern that directories have to match */
  dirRegexp: RegExp;
  /** Pattern that directories cannot match */
  excludeDirRegexp?: RegExp;
}

/**
 * Search recursively for files
 * @param options
 */
export async function* researchDirectory(
  { fileRegexp, excludeFileRegexp, dirRegexp, excludeDirRegexp, path }:
    ResearchDirectoryOptions,
): AsyncGenerator<string> {
  await Deno.permissions.request({
    name: "read",
  });

  for await (const { name, isDirectory, isFile } of Deno.readDir(path)) {
    const filePath = `${path}/${name}`;

    if (isFile && !excludeFileRegexp?.test(name) && fileRegexp.test(name)) {
      yield filePath;
    }

    if (isDirectory && !excludeDirRegexp?.test(name) && dirRegexp.test(name)) {
      for await (
        const path of researchDirectory({
          path: filePath,
          excludeFileRegexp,
          fileRegexp,
          dirRegexp,
          excludeDirRegexp,
        })
      ) {
        yield path;
      }
    }
  }
}

export enum LicenseStatus {
  NotFound = 0,
  PartiallyFound = 1,
  Found = 2,
}

/**
 * Generate styled indent
 * @param string – text in indent
 */
export function formatIndent(string: string) {
  return `  » ${gray(string)} ${white("–")}`;
}

/**
 * Format LicenseCheck to nice to look at output
 * @param licenseCheck – checkFileForLicense output
 * @param path
 */
export function formatLicenseCheckOutput(
  [status, amount, prepended]: LicenseCheck,
  path: string,
): string {
  let string = formatIndent(path) + " ";

  const prependedLicense = prepended
    ? white(`(${green("prepended license")})`)
    : "";
  const percentFound = cyan((amount * 100).toFixed(2) + "%");

  switch (status) {
    case LicenseStatus.Found:
      string += green("found");
      break;
    case LicenseStatus.PartiallyFound:
      string += yellow(`partially found (${percentFound}) ${prependedLicense}`);
      break;
    case LicenseStatus.NotFound:
      string += red(`not found ${prependedLicense}`);
      break;
  }

  return string;
}

export const urlRegexp =
  /^((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)$/;
export const regexpRegexp = /^\/(.+)\/([gmixsuUAjD])*$/;

export interface License {
  origin: string | RegExp | URL;
  value: string[] | RegExp;
}

/**
 * Compile string to regexp
 * @param value
 */
export function compileStringRegexp(value: string): RegExp | undefined {
  if (regexpRegexp.test(value)) {
    const pattern = value.replace(regexpRegexp, "$1");
    const flags = value.replace(regexpRegexp, "$2");
    const regexp = new RegExp(pattern, flags);
    return regexp;
  }

  return undefined;
}

/**
 * Compile given string to license, it can be:
 * - url
 * - RegExp
 * - string
 * @param value – url, regexp or string
 * @param normalizeNewlines – whether to change `\\n` to `\n`
 */
export async function compileLicense(
  value: string,
  normalizeNewlines: boolean,
): Promise<License> {
  if (urlRegexp.test(value)) {
    const url = new URL(value);

    await Deno.permissions.request({
      name: "net",
      host: url.host,
    });

    const response = await fetch(url);
    let text = await response.text();

    if (normalizeNewlines) {
      text = text.replace("\\n", "\n");
    }

    return {
      origin: url,
      value: text.split("\n"),
    };
  }

  const regexp = compileStringRegexp(value);
  if (regexp) {
    return {
      origin: regexp,
      value: regexp,
    };
  }

  try {
    await Deno.permissions.request({
      name: "read",
    });

    let text = await Deno.readTextFile(value);

    if (normalizeNewlines) {
      text = text.replace("\\n", "\n");
    }

    return {
      origin: value,
      value: text.split("\n"),
    };
  } catch {
    if (normalizeNewlines) {
      value = value.replace("\\n", "\n");
    }

    return {
      origin: value,
      value: value.split("\n"),
    };
  }
}

export type LicenseCheck = [LicenseStatus, number, boolean];

export enum PrependLicense {
  Never = 0,
  FullyMissing = 1,
  PartialOrFullyMissing = 2,
}

export interface CheckFileForLicenseOptions {
  /** File path to be checked */
  filePath: string;
  /** Compiled license */
  license: License;
  /** Whether to prepend license when missing */
  prepend: PrependLicense;
  /** Whether to log output to console */
  log: boolean;
}

/**
 * Checks whether file contains given license
 * @param options
 */
export async function checkForLicense(
  { filePath, license, prepend, log }: CheckFileForLicenseOptions,
): Promise<LicenseCheck> {
  await Deno.permissions.request({
    name: "read",
  });

  const text = await Deno.readTextFile(filePath);

  let found: LicenseCheck = [LicenseStatus.NotFound, 0, false];

  if (license.value instanceof RegExp) {
    if (license.value.test(text)) {
      found = [LicenseStatus.Found, 1, false];
    }
  } else if (text.includes(license.value.join("\n"))) {
    found = [LicenseStatus.Found, 1, false];
  } else {
    let foundLines = 0;
    for (const line of license.value) {
      if (text.includes(line)) {
        ++foundLines;
      }
    }

    if (foundLines > 0) {
      found = [
        LicenseStatus.PartiallyFound,
        foundLines / license.value.length,
        false,
      ];
    }
  }

  if (
    prepend !== PrependLicense.Never && license.value instanceof RegExp
  ) {
    throw new Error(
      "RegExp license value can only be used to search for a license!",
    );
  } else if (
    (prepend === PrependLicense.FullyMissing &&
      found[0] === LicenseStatus.NotFound) ||
    (prepend === PrependLicense.PartialOrFullyMissing &&
      found[0] <= LicenseStatus.PartiallyFound)
  ) {
    try {
      const start = Date.now();
      await Deno.permissions.request({
        name: "write",
      });
      permissionDelay += Date.now() - start;

      await Deno.writeTextFile(filePath, `${license.value}\n${text}`);
      found[2] = true;
    } catch {
      found[2] = false;
    }
  }

  if (log) {
    formatLicenseCheckOutput(found, filePath);
  }

  return found;
}

export interface CheckDirectoryForLicensesOptions {
  /** Starting path */
  path: string;
  /** Regex that files have to match */
  fileRegexp: RegExp;
  /** Regex that directories have to match */
  dirRegexp: RegExp;
  /** Regex that files cannot match */
  excludeFileRegexp?: RegExp;
  /** Regex that directories cannot match */
  excludeDirRegexp?: RegExp;
  /** Compiled license */
  license: License;
  /** Whether to prepend license when missing */
  prepend: PrependLicense;
  /** Whether to log output to console */
  log: boolean;
}

export async function checkDirectoryForLicenses(
  {
    path,
    fileRegexp,
    dirRegexp,
    excludeFileRegexp,
    excludeDirRegexp,
    license,
    prepend,
    log,
  }: CheckDirectoryForLicensesOptions,
) {
  await Deno.permissions.request({
    name: "read",
    path,
  });

  const start = Date.now();
  const status = [0, 0, 0];
  console.log(`Checking licenses in: ${cyan(path)}`);

  const promises: Promise<unknown>[] = [];
  for await (
    const filePath of researchDirectory({
      path,
      fileRegexp,
      excludeFileRegexp,
      dirRegexp,
      excludeDirRegexp,
    })
  ) {
    promises.push(
      checkForLicense({ filePath, license, log, prepend })
        .then(
          (value: LicenseCheck) => {
            console.log(
              formatLicenseCheckOutput(value, filePath.replace(path, "")),
            );
            ++status[value[0]];
          },
        ),
    );
  }

  await Promise.all(promises);

  const checkedFiles = status.reduce((a, b) => a + b);
  const filesMarker = `${green(String(status[2]))}/${
    yellow(String(status[1]))
  }/${red(String(status[0]))}`;
  const delay = permissionDelay
    ? `(${permissionDelay}ms caused by requesting permissions)`
    : "";

  console.log(
    `Summary:
${formatIndent(`Checked ${checkedFiles} files`)} (${filesMarker})
${formatIndent(`It took`)} ${Date.now() - start}ms ${delay}`,
  );
}
