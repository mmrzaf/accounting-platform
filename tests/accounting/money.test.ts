import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountingError } from '../../src/modules/accounting/errors.ts'
import { MAX_SQLITE_INTEGER, convertedMinorUnits, minorUnits, positiveRatePart, roundRatio, currencyCode, currencyDecimals } from '../../src/modules/accounting/money.ts'
import { dateOnly } from '../../src/modules/accounting/validation.ts'
const failure = (fn:()=>unknown,code:string) => assert.throws(fn,err=>err instanceof AccountingError && err.code===code)

test('minor units and FX remain exact beyond the JavaScript safe-number range',()=>{
  assert.equal(minorUnits('9007199254740993'),9007199254740993n)
  assert.equal(minorUnits(MAX_SQLITE_INTEGER.toString()),MAX_SQLITE_INTEGER)
  assert.equal(convertedMinorUnits(100_000_001n,900_000_001n,1_000_000_000n),90_000_001n)
  assert.equal(roundRatio(1n,2n),0n)
  assert.equal(roundRatio(3n,2n),2n)
  assert.equal(roundRatio(5n,2n),2n)
  assert.equal(roundRatio(7n,2n),4n)
  assert.equal(roundRatio(2n,3n),1n)
})
test('no floats, exponents, negative, noncanonical or overflowing money values',()=>{
  for(const value of ['01','1.01','1e4','-1','+2',' 1','1 ','',Number.MAX_SAFE_INTEGER,null,undefined]) failure(()=>minorUnits(value),'INVALID_INPUT')
  failure(()=>minorUnits((MAX_SQLITE_INTEGER+1n).toString()),'AMOUNT_OUT_OF_RANGE')
  failure(()=>convertedMinorUnits(MAX_SQLITE_INTEGER,2n,1n),'AMOUNT_OUT_OF_RANGE')
  for(const bad of ['0','-1','2.2','1e3','0'.repeat(40),'123456789012345678901234567890123']) failure(()=>positiveRatePart(bad,'rate'),'INVALID_INPUT')
  failure(()=>roundRatio(1n,0n),'INVALID_INPUT')
  failure(()=>currencyCode('Toman'),'INVALID_INPUT')
  failure(()=>currencyDecimals(9),'INVALID_INPUT')
  failure(()=>currencyDecimals(0.5),'INVALID_INPUT')
})
test('dates are validated canonically without locale or timezone interpretation',()=>{
  assert.equal(dateOnly('2028-02-29'),'2028-02-29')
  for(const bad of ['2027-02-29','2026-13-01','2026-00-30','2026-11-31','2026/11/17','1405-12-99','']) failure(()=>dateOnly(bad),'INVALID_INPUT')
})
