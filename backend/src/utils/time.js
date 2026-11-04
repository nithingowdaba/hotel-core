'use strict';

const IST_OFFSET_MINUTES = 330;

function istDateToUtc(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) throw new TypeError('Date must use YYYY-MM-DD.');
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TypeError('Date is invalid.');
  }
  return new Date(date.getTime() - IST_OFFSET_MINUTES * 60_000);
}

function istToday() {
  const now = new Date(Date.now() + IST_OFFSET_MINUTES * 60_000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function shiftDate(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

module.exports = { istDateToUtc, istToday, shiftDate };
