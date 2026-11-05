const moneyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const dateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
export const formatMoney = (rupees) => moneyFormatter.format(Number(rupees || 0));
export const rupeesToPaise = (rupees) => Math.round(Number(rupees || 0) * 100);
export const paiseToRupees = (paise) => Number(paise || 0) / 100;
export const sumPaise = (lines) => lines.reduce((sum, line) => sum + rupeesToPaise(line.price) * Number(line.qty || line.quantity || 0), 0);
export const formatDate = (date) => dateFormatter.format(new Date(date));
