# Inventory Future Module

## Status

Inventory management is a future module.

It should be documented now but not included in the first MVP implementation.

## Reason

Inventory management can become large and complex.

It may require:

- Item catalog
- Units
- Building/property stock locations
- Current quantity
- Minimum quantity
- Stock-in records
- Stock-out records
- Adjustment history
- Order request integration
- Alerts
- Permissions

The first MVP should focus on order requests instead of full inventory control.

## Future Goals

Possible future inventory features:

- Building/property-level stock list
- Item categories
- Current quantity
- Minimum stock threshold
- Low-stock alert
- Stock-in/stock-out history
- Link low-stock items to order requests
- Photo per item
- Supplier/vendor link

## Relationship to Order Requests

Order requests should be implemented first.

Later, inventory can connect to order requests.

Possible future flow:

```txt
Inventory item reaches low stock
System suggests order request
Office Admin approves/orders
Stock is updated after item arrives
```

## Open Questions

- Should inventory be tracked by building/property or central storage?
- Which item categories are needed?
- Should quantities be exact or approximate?
- Who updates stock counts?
- Should inventory support barcode/QR code later?

