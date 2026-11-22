import { expectTypeOf } from 'expect-type';
import { add } from '../../../../libs/add/src/index';
import type { EchoResult } from '../../../../libs/network/src/index';

// A type test that is TRUE: tsc is happy, nothing happens at runtime.
expectTypeOf(add(1, 2)).toEqualTypeOf<number>();

expectTypeOf<EchoResult>().toMatchTypeOf<{
  sent: string;
  received: string;
  elapsedMs: number;
}>();

// A type test that is FALSE, commented out: uncomment to see tsc fail this
// line specifically, at compile time, with no code ever running.
// expectTypeOf(add(1, 2)).toEqualTypeOf<string>();

console.log('probe.types.test.ts finished executing — but note nothing above actually asserted anything at runtime.');
