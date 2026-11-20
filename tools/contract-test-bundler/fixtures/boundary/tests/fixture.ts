// Tiny module mocked in probe.test.ts to exercise rs.mock() hoisting.
export function greet(name: string): string {
  return `hello, ${name}`;
}
