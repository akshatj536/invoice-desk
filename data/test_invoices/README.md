# Test invoices (not in the sample library)

Upload these from the **Process** page (drag & drop) to test the system yourself.
They use their own purchase orders (PO-1066 to PO-1076) and do not affect the demo invoices.

**Run t05 before t06.**

| File | Vendor as printed | Invoice | Total | What's different | Expected |
|---|---|---|---|---|---|
| `t01_scan_acme_alias.pdf` | ACME Furniture | AF-11208 | $4,328.64 | Scanned (skewed, noisy). Vendor printed as 'ACME Furniture' (a known alias). Item names differ from the PO, no item codes. PO written as 'PO 1066'. | APPROVE - vendor matched by alias, lines paired by meaning, PO-1066 closed |
| `t02_summit_name_variant.pdf` | Summit Technology Supplies, L.L.C. | STS-62044 | $4,417.20 | Vendor printed as 'Summit Technology Supplies, L.L.C.' - not a name in the vendor file. Item names reworded, no item codes. | APPROVE - vendor matched by tax ID (shown as a note), lines paired by meaning |
| `t03_badscan_greenleaf_price.pdf` | Greenleaf Facilities | GFS-2026-1121 | $3,990.60 | Fax-quality scan with JPEG artefacts. Vendor as 'Greenleaf Facilities' (alias). Window cleaning billed at $495 vs $450 on the PO. | HOLD - price above PO (+10%) and over the PO total |
| `t04_blueharbor_fuel_surcharge.pdf` | Blue Harbor Freight | BHF-7731 | $2,490.00 | Vendor as 'Blue Harbor Freight' (alias). Adds a $20 fuel surcharge that is not on the PO - small enough that the total is still inside the 1% tolerance. | HOLD - charge not on PO (caught line by line even though the total is within tolerance) |
| `t05_acme_partial_reworded.pdf` | Acme Office Furniture Company | AOF-90533 | $3,607.20 | Vendor as 'Acme Office Furniture Company' (alias). Bills 2 of the 4 sofas and all 4 tables, with reworded item names. | APPROVE - partial invoice; PO-1074 stays open with $2,300 left |
| `t06_phone_photo_of_t05.pdf` | Acme Office Furniture Company | AOF-90533 | $3,607.20 | The same invoice as t05, re-sent as a blurry phone photo (different file, same bill). | Run AFTER t05: REJECT - already paid. The routing number is genuinely blurry: the system re-reads the bank details once; if a digit still can't be confirmed it says so (possible misread) rather than crying fraud. (Run before t05 it would approve, or hold on the unreadable digit.) |
| `t07_summit_wrong_po.pdf` | Summit Tech Supplies LLC | STS-62071 | $1,736.64 | Cites PO-1070 - a real PO, but it belongs to Greenleaf (janitorial), not Summit. Typo-style mistake. | HOLD - PO belongs to another vendor; suggests PO-1076 (docks + keyboards) for a person to confirm |
| `t08_unknown_vendor.pdf` | Northgate Office Supply Co. | NOS-5521 | $1,671.84 | 'Northgate Office Supply Co.' - not in the vendor file under any name or tax ID. Cites someone else's PO. | REJECT - vendor not approved (must be onboarded first) |
