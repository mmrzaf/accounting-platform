import test from 'node:test'
import assert from 'node:assert/strict'
import { roundHalfEven } from '../../web/src/lib/rounding.ts'

test('UI line rounding uses the exact banker rounding rule of ledger posting', () => {
  assert.equal(roundHalfEven(10025n,10n),1002n)
  assert.equal(roundHalfEven(10035n,10n),1004n)
  assert.equal(roundHalfEven(3000n,1000n),3n)
  assert.equal(roundHalfEven(2500n,1000n),2n)
  assert.equal(roundHalfEven(3500n,1000n),4n)
  assert.throws(()=>roundHalfEven(-1n,1000n))
  assert.throws(()=>roundHalfEven(1n,0n))
})
