'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { istDateToUtc, istToday, shiftDate } = require('../src/utils/time');

test('IST date boundaries convert to half-open UTC ranges', () => {
  assert.equal(istDateToUtc('2026-11-04').toISOString(), '2026-11-03T18:30:00.000Z');
  assert.equal(istDateToUtc(shiftDate('2026-11-04', 1)).toISOString(), '2026-11-04T18:30:00.000Z');
  assert.match(istToday(), /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => istDateToUtc('2026-02-30'));
});
