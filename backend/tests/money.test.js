'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rupeesToPaise, paiseToRupees, formatINR, addPaise, multiplyPaise } = require('../utils/money');

describe('rupeesToPaise', () => {
  it('converts integer rupees', () => assert.equal(rupeesToPaise(100), 10000));
  it('converts decimal rupees', () => assert.equal(rupeesToPaise('149.50'), 14950));
  it('converts zero', () => assert.equal(rupeesToPaise(0), 0));
  it('converts single decimal', () => assert.equal(rupeesToPaise('10.5'), 1050));
  it('handles trailing zeros', () => assert.equal(rupeesToPaise('200.00'), 20000));
});

describe('paiseToRupees', () => {
  it('converts paise to rupee string', () => assert.equal(paiseToRupees(14950), '149.50'));
  it('handles zero paise', () => assert.equal(paiseToRupees(0), '0.00'));
  it('handles single-digit paise', () => assert.equal(paiseToRupees(5), '0.05'));
  it('handles round rupees', () => assert.equal(paiseToRupees(10000), '100.00'));
});

describe('formatINR', () => {
  it('formats with rupee symbol', () => assert.equal(formatINR(14950), '₹149.50'));
  it('formats zero', () => assert.equal(formatINR(0), '₹0.00'));
});

describe('addPaise', () => {
  it('adds two paise values', () => assert.equal(addPaise(100, 200), 300));
  it('handles zero', () => assert.equal(addPaise(0, 500), 500));
});

describe('multiplyPaise', () => {
  it('multiplies paise by quantity', () => assert.equal(multiplyPaise(14950, 3), 44850));
  it('handles zero quantity', () => assert.equal(multiplyPaise(14950, 0), 0));
});
