export class DomainValidationError extends Error {
  constructor(public readonly code: string, message: string, public readonly reference?: string) { super(message); this.name = 'DomainValidationError'; }
}
export function requireFact(condition: unknown, code: string, message: string, reference?: string): asserts condition {
  if (!condition) throw new DomainValidationError(code, message, reference);
}
