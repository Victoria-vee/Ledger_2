export interface TransactionParser {
  parseTransactions(text: string, referenceDate: string): Promise<unknown>;
}

export class AiProviderUnavailableError extends Error {
  constructor() {
    super("Local AI provider is unavailable.");
    this.name = "AiProviderUnavailableError";
  }
}

export class InvalidAiModelOutputError extends Error {
  constructor() {
    super("The local AI provider returned invalid output.");
    this.name = "InvalidAiModelOutputError";
  }
}
