// Copyright 2021 Im-Beast. All rights reserved. MIT license.
import {
  bold,
  cyan,
  gray,
  green,
  italic,
  magenta,
  red,
  yellow,
} from "./deps.ts";
import {
  checkDirectoryForLicenses,
  compileLicense,
  compileStringRegexp,
  PrependLicense,
} from "./license_check.ts";
import { parseArgs } from "./parse_args.ts";

type Option =
  & {
    message: string;
    value?: string[];
    priority: number;
  }
  & ({
    args?: string[];
    func?: (...args: string[]) => void;
  } | {
    args?: never;
    func?: never;
  });

interface Options {
  [name: string]: Option;
}

const optionLinks = new Map<string, Option>();

const options: Options = {
  help: {
    message: "Shows this message",
    func() {
      console.log(options.help.message);
      Deno.exit(0);
    },
    priority: 3,
  },
  license: {
    message: "License text",
    args: ["path|string|regexp|url"],
    priority: 2,
  },
  prepend: {
    message: "Prepend license header to files missing one",
    args: ["?partial <false>"],
    priority: 2,
  },
  normalizeNewlines: {
    message: "converts \\n to newline in license field",
    priority: 2,
  },
  quiet: {
    message: "Do not print anything except errors",
    priority: 2,
  },
  throwErrors: {
    message: "Program will throw on errors instead of exiting",
    priority: 2,
  },
  exclude: {
    message: "Exclude given regexps",
    args: ["file-regexp", "?dir-regexp"],
    priority: 2,
  },
  input: {
    message: "Directory that will be searched using regexp pattern",
    args: ["path", "file-regexp", "?dir-regexp </.+/>"],
    async func(
      path: string,
      $fileRegexp: string,
      $dirRegexp = "^(?!node_modules).+",
    ) {
      if (!options.license.value?.length) {
        cliError(
          `License pattern is missing, set it using ${
            styleArg("--license")
          } option`,
        );
        Deno.exit(1);
      }

      let prepend: PrependLicense = PrependLicense.Never;

      if (options.prepend.value) {
        prepend = PrependLicense.FullyMissing;

        if (options.prepend.value.length) {
          try {
            if (JSON.parse(options.prepend.value[0])) {
              prepend = PrependLicense.PartialOrFullyMissing;
            }
          } catch (error) {
            cliError(
              `Failed parsing argument of ${
                styleArg("-p|--prepend")
              } option ${error.message}`,
              error,
            );
            Deno.exit(1);
          }
        }
      }

      let normalizeNewlines = false;
      if (options.normalizeNewlines.value) {
        normalizeNewlines = true;
      }

      const license = await compileLicense(
        options.license.value[0],
        normalizeNewlines,
      );
      if (!license) {
        cliError(`Given ${styleArg("--license")} argument is invalid!`);
        Deno.exit(1);
      }

      try {
        let excludeFileRegexp: RegExp | undefined = undefined;
        let excludeDirRegexp: RegExp | undefined = undefined;

        if (options.exclude?.value?.length) {
          excludeFileRegexp = compileStringRegexp(options.exclude.value[0]) ||
            new RegExp(options.exclude.value[0]);
          if (options.exclude?.value?.length > 1) {
            excludeDirRegexp = compileStringRegexp(options.exclude.value[1]) ||
              new RegExp(options.exclude.value[1]);
          }
        }

        const fileRegexp = compileStringRegexp($fileRegexp) ||
          new RegExp($fileRegexp);
        const dirRegexp = compileStringRegexp($dirRegexp) ||
          new RegExp($dirRegexp);

        try {
          await checkDirectoryForLicenses({
            fileRegexp,
            dirRegexp,
            excludeFileRegexp,
            excludeDirRegexp,
            license,
            log: !options.quiet.value,
            path,
            prepend,
          });
        } catch (error) {
          cliError(
            `Failed while researching directory – ${error.message}`,
            error,
          );
        }
      } catch (error) {
        cliError(`Given regex is invalid – ${error.message}`, error);
      }
    },
    priority: 1,
  },
};

/**
 * Error handler
 * @param message – message to be displayed when error happened
 */
function cliError(message: string, error?: Error): void {
  if (options.throwErrors.value) {
    throw error || new Error(message);
  } else {
    console.log(`${red("Error")} ${yellow(">")} ${message}`);
  }
}

function styleArg(arg: string): string {
  const optional = arg[0] === "?";

  let text = optional ? magenta("?") + arg.slice(1) : arg;
  text = text.replace(/(\<|\>)/g, yellow("$1"));
  text = text.replace(/(\|)/g, green("$1"));
  text = gray(text);

  return green(`[${text}]`);
}

if (import.meta.main) {
  let message = bold("Anzu - deno license checker\n\n");
  for (const [name, command] of Object.entries(options)) {
    if (optionLinks.get(name)) {
      throw new Error("Option with this name already exists!");
    }

    let short = `-${name[0]}`;
    let i = 1;
    while (optionLinks.get(short)) {
      short = `-${name.slice(i++)}`;
    }
    const long = `--${name}`;

    message += `${cyan(short)} ${cyan(long)} ${
      command.args?.length ? `${command.args.map(styleArg).join(" ")} ` : ""
    }${gray("–")} ${command.message}\n`;

    optionLinks.set(short, command);
    optionLinks.set(long, command);
  }

  message += italic(`\nLegend ${
    styleArg(
      `"${
        magenta("?")
      }" – argument is optional | "<value>" – default value | "|" – or`,
    )
  }`);

  options.help.message = message;

  const cliArgs = parseArgs(Deno.args);

  interface Action {
    priority: number;
    func: () => void;
  }

  const actions: Action[] = [];
  const entries = Object.entries(cliArgs);

  if (entries.length === 0) {
    entries.push(["--help", []]);
  }

  for (const [name, args] of entries) {
    const option = optionLinks.get(name);
    if (!option) {
      cliError(`Option ${cyan(name)} has not been found`);
      Deno.exit(1);
    }

    if (option.args) {
      for (const [i, arg] of option.args.entries()) {
        if (arg[0] !== "?" && !args[i]) {
          cliError(
            `Required option argument ${styleArg(arg)} for ${
              cyan(name)
            } is missing`,
          );
          Deno.exit(1);
        }
      }
    }

    const action: Action = {
      priority: option.priority,
      func: () => {
        if (option.func) {
          option.func(...args);
        } else {
          option.value = args;
        }
      },
    };

    actions.push(action);
  }

  for (const { func } of actions.sort((a, b) => b.priority - a.priority)) {
    func();
  }
}
