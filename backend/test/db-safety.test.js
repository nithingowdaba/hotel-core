'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  assertDemoDatabase,
  assertResetDatabase,
  quoteDatabaseIdentifier,
  selectedDatabase,
} = require('../scripts/db-config');
const { resetDatabase } = require('../scripts/reset-db');

test('database selection requires and safely validates an explicit target', () => {
  assert.equal(selectedDatabase([], { DB_NAME: 'hotel_core_test' }), 'hotel_core_test');
  assert.equal(selectedDatabase(['--database', 'qa_test'], {}), 'qa_test');
  assert.equal(selectedDatabase(['--database=other_dev'], {}), 'other_dev');
  assert.equal(quoteDatabaseIdentifier('hotel_core_test'), '`hotel_core_test`');
  assert.throws(() => selectedDatabase([], {}), /Select a database/);
  for (const unsafe of ['hotel-core_test', 'x` DROP DATABASE hotel_core_test', 'test;DROP']) {
    assert.throws(() => selectedDatabase(['--database', unsafe], {}), /Database name/);
    assert.throws(() => quoteDatabaseIdentifier(unsafe), /Database name/);
  }
});

test('demo seeding accepts only development or test targets', () => {
  assert.equal(assertDemoDatabase('hotel_core_dev'), 'hotel_core_dev');
  assert.equal(assertDemoDatabase('hotel_core_test'), 'hotel_core_test');
  assert.throws(() => assertDemoDatabase('hotel_core'), /only for databases ending/);
  assert.throws(() => assertDemoDatabase('udupi_hotel'), /only for databases ending/);
});

test('reset requires both a _test target and exact-name confirmation', () => {
  assert.equal(assertResetDatabase('hotel_core_test', 'hotel_core_test'), 'hotel_core_test');
  assert.throws(() => assertResetDatabase('hotel_core_dev', 'hotel_core_dev'), /only for a database ending in _test/);
  assert.throws(() => assertResetDatabase('hotel_core_test'), /Reset refused/);
  assert.throws(() => assertResetDatabase('hotel_core_test', 'other_test'), /Reset refused/);
});

test('reset refuses unsafe targets before opening a database connection', async () => {
  let connected = false;
  const mysqlClient = {
    async createConnection() {
      connected = true;
      throw new Error('connection must not be opened');
    },
  };
  await assert.rejects(
    resetDatabase({ args: ['--database=udupi_hotel', '--confirm-reset=udupi_hotel'], mysqlClient }),
    /only for a database ending in _test/,
  );
  assert.equal(connected, false);
});
