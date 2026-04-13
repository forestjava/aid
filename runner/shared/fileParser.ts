const FILE_START = /^===FILE:\s*(.+?)\s*===$/;
const FILE_END = /^===END_FILE===$/;

export function parseFileOutput(llmOutput: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = llmOutput.split('\n');

  let currentFile: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const startMatch = line.match(FILE_START);
    if (startMatch) {
      currentFile = startMatch[1];
      currentContent = [];
      continue;
    }

    if (FILE_END.test(line) && currentFile) {
      result.set(currentFile, currentContent.join('\n').trim());
      currentFile = null;
      currentContent = [];
      continue;
    }

    if (currentFile !== null) {
      currentContent.push(line);
    }
  }

  return result;
}
