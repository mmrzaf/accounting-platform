import test from 'node:test'
import assert from 'node:assert/strict'
import { parseConfig, validateRuntime, ConfigurationError } from '../../src/platform/config/runtime.ts'
import { makeLogRecord } from '../../src/platform/logging/logger.ts'
import { formatDate, formatInteger, formatMoney, getDirection } from '../../src/ui/i18n/locale.ts'

test('Node version policy accepts 22.16+, 24, 26 and rejects unsupported lines', () => {
  for (const version of ['22.16.0', '22.22.1', '24.0.0', '24.12.1', '26.0.0']) assert.equal(validateRuntime(version).version, version)
  for (const version of ['20.19.0', '22.15.9', '23.0.0', '25.0.0', '27.0.0']) assert.throws(() => validateRuntime(version), ConfigurationError)
  assert.equal(validateRuntime('24.1.0').primary, true)
  assert.equal(validateRuntime('22.16.0').primary, false)
})

test('config defaults are loopback-only and paths are resolved', () => {
  const config = parseConfig({}, '/example')
  assert.equal(config.bindHost, '127.0.0.1')
  assert.equal(config.port, 3000)
  assert.ok(config.dbPath.endsWith('var/data/accounting.sqlite'))
})

test('invalid ports and bind addresses fail closed', () => {
  for (const port of ['0', '65536', '-1', 'abc', '1.2']) assert.throws(() => parseConfig({ APP_PORT: port }), ConfigurationError)
  assert.throws(() => parseConfig({ APP_BIND_HOST: 'evil.example' }), ConfigurationError)
  assert.throws(() => parseConfig({ APP_BIND_HOST: '0.0.0.0' }), ConfigurationError)
})

test('logging allows known safe fields and never serializes secrets or opaque payloads', () => {
  const record = makeLogRecord('info', 'db.migration', { operation: 'apply', token: 'SECRET', password: 'SECRET', value: { password: 'SECRET' }, status: 'ok' }, '2026-01-01T00:00:00Z')
  assert.equal(record['operation'], 'apply')
  assert.equal(record['status'], 'ok')
  assert.doesNotMatch(JSON.stringify(record), /SECRET|token|password|value/)
  assert.throws(() => makeLogRecord('bad-level' as 'info', 'db.test'), TypeError)
})

test('localization switches direction without modifying canonical data', () => {
  assert.equal(getDirection('fa-IR'), 'rtl')
  assert.equal(getDirection('en-US'), 'ltr')
  assert.match(formatInteger(123456789012345678901234567890n, 'en-US'), /123,456,789/)
  assert.match(formatMoney({ minorUnits: 12345n, scale: 2, currency: 'USD' }, 'en-US'), /123\.45/)
  assert.match(formatMoney({ minorUnits: -125000000n, scale: 0, currency: 'IRR' }, 'fa-IR'), /−/)
  assert.equal(formatDate('2026-11-17T00:00:00.000Z', 'en-US', 'UTC').includes('2026'), true)
})

test('money display rejects unsafe numbers and does not silently convert IRR to Toman', () => {
  assert.throws(() => formatMoney({ minorUnits: Number.MAX_SAFE_INTEGER as unknown as bigint, scale: 0, currency: 'IRR' }), TypeError)
  assert.throws(() => formatMoney({ minorUnits: 1n, scale: 0, currency: 'toman' }), TypeError)
  assert.match(formatMoney({ minorUnits: 10n, scale: 0, currency: 'IRR' }), /IRR/)
})
