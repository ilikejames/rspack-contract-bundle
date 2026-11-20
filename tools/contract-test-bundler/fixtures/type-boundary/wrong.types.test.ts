import { expectTypeOf } from 'expect-type';
import { add } from '../../../../packages/add/src/index';

// Deliberately WRONG: add() returns number, not string.
expectTypeOf(add(1, 2)).toEqualTypeOf<string>();

console.log('ran to completion despite the type assertion above being wrong');
