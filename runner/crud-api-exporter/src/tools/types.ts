export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolContext {
  jobId: string;
  sourcePath: string;
  sendProgress: (status: string, message: string) => Promise<void>;
}

export interface ToolHandler {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<string>;
}
