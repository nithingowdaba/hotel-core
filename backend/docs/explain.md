# Order query EXPLAIN results

Generated with `npm run db:explain` against `hotel_core_test` on 2026-11-04. The script inserted temporary fixture rows for 5,000 orders (2,500 per hotel) and 10,000 order items, ran `EXPLAIN`, then removed the fixture. No schema or index changes were made.

| Query | Selected plan | Estimated rows | Notes |
|---|---|---:|---|
| Hotel pending orders | `idx_orders_hotel_status_created`, `ref`, backward index scan | 1,250 | Uses hotel, status, and creation-time index for the ordered page. |
| Customer order history | `idx_orders_user_created`, `ref`, backward index scan | 5,000 | Uses the user/created index and is covering for the fixture query. |
| Daily sales | Orders use `idx_orders_hotel_status_created` with a range scan; items use `idx_oi_order` | 1 order estimate | Both join sides include the hotel key and the date predicate is a half-open range. |
| Top-selling items | Orders use `idx_orders_hotel_status_created` with a range scan; items use `idx_oi_order` | 1 order estimate | The grouped result uses a temporary table, which is expected for aggregation. |

Raw plan highlights from MySQL:

```text
hotel_pending_orders: key=idx_orders_hotel_status_created; type=ref; Extra=Using where; Backward index scan
customer_order_history: key=idx_orders_user_created; type=ref; Extra=Backward index scan; Using index
daily_sales orders: key=idx_orders_hotel_status_created; type=range; Extra=Using index condition; Using where
daily_sales order_items: key=idx_oi_order; type=ref; Extra=Using where
top_selling_items orders: key=idx_orders_hotel_status_created; type=range; Extra=Using index condition; Using where; Using temporary
top_selling_items order_items: key=idx_oi_order; type=ref; Extra=Using where
```
