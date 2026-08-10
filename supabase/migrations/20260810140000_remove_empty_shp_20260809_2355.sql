DELETE FROM public.procurement_shipments s
WHERE s.shipment_no = 'SHP-20260809-2355'
  AND NOT EXISTS (SELECT 1 FROM public.procurement_shipment_lines l WHERE l.shipment_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM public.procurement_shipment_costs c WHERE c.shipment_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM public.procurement_receipts r WHERE r.shipment_id = s.id);
