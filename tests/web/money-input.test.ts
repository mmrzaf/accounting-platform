import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalDigits, majorToMinor, money, today } from '../../web/src/lib/api.ts'

test('localizes input digits without floating-point amounts', () => {
  assert.equal(canonicalDigits('۱۲۳٤٥٦'), '123456')
  assert.equal(majorToMinor('۱۲۳۴.۵۶', 2), '123456')
  assert.equal(majorToMinor('1,234.10', 2), '123410')
  assert.equal(majorToMinor('92233720368547758.07', 2), '9223372036854775807')
  assert.equal(money('123410', 2, 'en', 'USD'), '1,234.10 USD')
  assert.throws(() => majorToMinor('2.001', 2), /decimal places/u)
  assert.throws(() => majorToMinor('NaN', 0), /valid/u)
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/u)
})
