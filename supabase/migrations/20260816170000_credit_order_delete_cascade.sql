-- Sifariş silinərkən ödənişi olmayan kreditin texniki alt qeydləri əsas
-- müqavilənin silinməsini bloklamamalıdır. Kredit ödənişləri RESTRICT qalır
-- və delete_sales_order_safe həmin halda silinməni biznes qaydası ilə dayandırır.
ALTER TABLE public.credit_adjustments
  DROP CONSTRAINT IF EXISTS credit_adjustments_credit_id_fkey,
  ADD CONSTRAINT credit_adjustments_credit_id_fkey
    FOREIGN KEY (credit_id) REFERENCES public.credit_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.credit_adjustments
  DROP CONSTRAINT IF EXISTS credit_adjustments_installment_id_fkey,
  ADD CONSTRAINT credit_adjustments_installment_id_fkey
    FOREIGN KEY (installment_id) REFERENCES public.credit_installments(id) ON DELETE CASCADE;

ALTER TABLE public.credit_restructures
  DROP CONSTRAINT IF EXISTS credit_restructures_source_credit_id_fkey,
  ADD CONSTRAINT credit_restructures_source_credit_id_fkey
    FOREIGN KEY (source_credit_id) REFERENCES public.credit_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.credit_restructures
  DROP CONSTRAINT IF EXISTS credit_restructures_replacement_credit_id_fkey,
  ADD CONSTRAINT credit_restructures_replacement_credit_id_fkey
    FOREIGN KEY (replacement_credit_id) REFERENCES public.credit_contracts(id) ON DELETE CASCADE;
