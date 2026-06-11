import { QueryEngine, type QueryEngineOptions } from "./query-engine.js";

export class AgentRuntime extends QueryEngine {
  constructor(options: QueryEngineOptions) {
    super(options);
  }

  run(input: string): Promise<string> {
    return this.submitMessage(input);
  }
}
