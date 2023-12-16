import { execSync } from "child_process";
import {
  createWriteStream,
  existsSync,
  readFileSync,
  stat,
  unlinkSync,
} from "fs";

const PIPE_PATH = "/command-runner";
const PIPE_OUTPUT_PATH = "/output.txt";
const PIPE_OUTPUT_CACHE_MINUTES = 3;
const PIPE_WAIT_SLEEP_TIME = 100; // milliseconds

const CommandOutputType = {
  Success: 0,
  Error: 1,
};

class CommandOutput {
  constructor(type, value) {
    this.type = type;
    this.value = value;
  }
}

const runCommand = (cmd) => {
  try {
    const output = execSync(cmd).toString().trim();
    return new CommandOutput(CommandOutputType.Success, output);
  } catch (e) {
    return new CommandOutput(CommandOutputType.Error, e.message);
  }
};

const sleep = (ms) => {
  const start = Date.now();
  while (Date.now() - start < ms) {}
};

const getFileLastModified = (filePath) => {
  let lastModified;
  stat(filePath, (err, stats) => {
    if (err) {
      lastModified = -2;
    } else {
      lastModified = Math.round(stats.mtimeMs);
    }
  });

  return lastModified;
};

const runCommandInPipe = (cmd) => {
  if (!existsSync(PIPE_PATH)) {
    return new CommandOutput(
      CommandOutputType.Error,
      "Cannot run command inside pipe"
    );
  }

  let lastModified = -1;
  if (existsSync(PIPE_OUTPUT_PATH)) {
    const lastModified = getFileLastModified(PIPE_OUTPUT_PATH);
    if (lastModified == -2) {
      return CommandOutput(
        CommandOutputType.Error,
        "Cannot read command output"
      );
    }
    const now = Date.now();
    const diff = (now - lastModified) / (1000 * 60);

    // If the last updated time was within threshold
    // Return the last result, no need to run the program again
    if (diff <= PIPE_OUTPUT_CACHE_MINUTES) {
      return new CommandOutput(
        CommandOutput.Success,
        readFileSync(PIPE_OUTPUT_PATH).toString()
      );
    }
  }

  const stream = createWriteStream(PIPE_PATH);
  stream.write(cmd);
  stream.close();

  let output = new CommandOutput(
    CommandOutputType.Error,
    "Cannot run command inside pipe"
  );

  // If output path does not exist, wait for it to be created
  // Edge case, will happen only first time
  if (lastModified === -1) {
    while (!existsSync(PIPE_OUTPUT_PATH)) {
      sleep(PIPE_WAIT_SLEEP_TIME);
    }
  } else {
    // Otherwise wait for the file to be modified
    while (true) {
      const lastModifiedMins = Math.round(
        getFileLastModified(PIPE_OUTPUT_PATH) / (1000 * 60)
      );
      if (lastModifiedMins == -2) {
        return CommandOutput(
          CommandOutputType.Error,
          "Cannot read command output"
        );
      }
      const nowMins = Math.round(Date.now() / (1000 * 60));

      if (nowMins - lastModified === 0) {
        break;
      }
      sleep(PIPE_WAIT_SLEEP_TIME);
    }
  }

  const outputData = readFileSync(PIPE_OUTPUT_PATH).toString();
  return new CommandOutput(CommandOutputType.Success, outputData);
};

const generateAESKeyIV = () => {
  const key = runCommand("openssl rand -hex 32");
  const iv = runCommand("openssl rand -hex 16");

  return {
    key,
    iv,
  };
};

const encryptWithAES = (key, iv, password) => {
  const encryptedOutput = runCommand(
    `echo "${password}" | openssl aes-256-cbc -e -a -K ${key} -iv ${iv}`
  );

  return encryptedOutput;
};

export {
  runCommand,
  runCommandInPipe,
  generateAESKeyIV,
  encryptWithAES,
  CommandOutputType,
};
