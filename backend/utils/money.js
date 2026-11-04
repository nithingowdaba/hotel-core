'use strict';

/**
 * Money utilities using integer paise (1 INR = 100 paise).
 * NEVER use floating-point arithmetic for monetary values.
 */

/**
 * Convert rupees (string or number) to paise.
 * @param {string|number} rupees
 * @returns {number} integer paise
 */
function rupeesToPaise(rupees) {
  // Multiply by 100 using string manipulation to avoid float errors
  const str = String(rupees).trim();
  const [intPart = '0', decPart = ''] = str.split('.');
  const dec = (decPart + '00').slice(0, 2); // ensure exactly 2 decimal places
  return parseInt(intPart, 10) * 100 + parseInt(dec, 10);
}

/**
 * Convert paise (integer) to a rupee string with 2 decimal places.
 * @param {number} paise
 * @returns {string} e.g. "149.00"
 */
function paiseToRupees(paise) {
  const int = Math.trunc(paise / 100);
  const dec = Math.abs(paise % 100).toString().padStart(2, '0');
  return `${int}.${dec}`;
}

/**
 * Format paise as a human-readable INR string.
 * @param {number} paise
 * @returns {string} e.g. "₹149.00"
 */
function formatINR(paise) {
  return `₹${paiseToRupees(paise)}`;
}

/**
 * Add two paise values safely.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addPaise(a, b) {
  return Math.trunc(a) + Math.trunc(b);
}

/**
 * Multiply paise by a positive integer quantity.
 * @param {number} paise
 * @param {number} quantity
 * @returns {number}
 */
function multiplyPaise(paise, quantity) {
  return Math.trunc(paise) * Math.trunc(quantity);
}

module.exports = { rupeesToPaise, paiseToRupees, formatINR, addPaise, multiplyPaise };
