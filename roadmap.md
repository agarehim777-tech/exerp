# ExERP təkmilləşdirmə yol xəritəsi

## 10 noyabr: tamamlanma tələbi
- [ ] Kadr və maliyyə üçün xüsusi, sahələri müəyyən edilmiş cədvəllər; məlumatların köçürülməsi və reload yoxlaması
- [ ] TypeScript keçidi və CI-də tip yoxlaması
- [ ] App orkestrasiya hissələrinin müstəqil modullara bölünməsi
- [ ] Qalan inline stillərin vahid görünüşə keçirilməsi
- [ ] KPI dövrləri və debitor bağlanmasının canlı tətbiqi və yoxlaması
- [ ] Baza funksiyalarının təhlükəsizlik auditi və təhlükəsiz düzəlişlər

1. [x] Kadr və maliyyə siyahılarını (işçi, şöbə, məzuniyyət, vakansiya, müqavilə, kassa qeydləri, hesablar, kreditlər) ayrıca sətir-sətir bazaya köçürmək — `tenant_collection_records` cədvəli + `useCollectionSync`
2. [x] Ölü səhifələri silmək (FinancePage, köhnə AccountingPage)
3. [x] Çatışmayan xarici açar indekslərini əlavə etmək (19 indeks)
4. [x] Yeni saxlama məntiqi üçün testlər (175 test keçir) + canlı yoxlama: işçi əlavə → yenidən yükləmə → qalır
5. [x] Paket bölgüsü yoxlanıldı — PDF və qrafiklər onsuz da yalnız lazım olanda yüklənir; ümumi vendor birləşdirmə daha pis nəticə verdiyi üçün saxlanılmadı
6. [~] Ümumi komponentlər CSS/token əsaslı vahid kitabxanaya çevrildi; maliyyə, mühasibat, hesabat və dashboard səhifələrinin mərhələli keçidi davam edir
7. [x] Satış və xərc həyat dövrü integration/E2E testləri ayrıca serial CI qapısı ilə əlavə edildi

## Təsdiqlənmiş yeni mərhələlər
8. [x] 53 lint xəbərdarlığı aradan qaldırıldı, istifadəsiz import/dəyişənlər təmizləndi; 624 test keçir
9. [~] Tipli naviqasiya/toast hook-ları və Button/Card/Input/Table təməli əlavə edildi; təhvil məntiqi 266 sətirlik ayrıca modula çıxarıldı. App.jsx və qalan böyük domen fayllarının bölünməsi tamamlanmayıb
10. [~] Dashboard, CashbookPage, SalesInvoicesPage, FinancialStatementsPage sabit inline stillərdən təmizləndi; ümumi audit 1845 → 1423. Qalan ekranların keçidi açıqdır
11. [ ] Kadr/maliyyə kolleksiyalarının xüsusi cədvəllərə təhlükəsiz keçidi — canlı sxem yoxlanıldı, dəyişdirilmədi. Maliyyə keçidinin canlı yoxlaması cashbook_ledger_summary/create_cash_expense_atomic/transfer_cash_atomic funksiyalarının bazada olmaması ilə bloklanır
12. [ ] Qalan TypeScript keçidi, səhifələmə və son canlı yoxlamalar — tam tip keçidi və CI tip qapısı hələ əlavə edilməyib

## Cari panel keçidi
- [x] Müştəri detalları: Button/Card/Input/Select/Tabs/DataTable keçidi; mərhələ üzrə 10 test keçdi
- [x] Müştəri siyahısı: vahid elementlər, cədvəl və formalar; mərhələ üzrə 12 test keçdi
- [x] Sifariş paneli: vahid elementlər və cədvəl; mərhələ üzrə 13 test keçdi
- [x] Son yoxlama: 624 test keçdi, lint xətasızdır; girişli real müştəri/sifariş panelləri masaüstü və 390px telefonda açıldı, runtime xətası və üfüqi daşma yoxdur. Bu üç faylda inline style və yerli HTML düymə/input/select/table qalmadı; maliyyə əməliyyatları dəyişdirilmədi.

Yoxlama: dashboard, təhvil, kredit, mühasibat, HR ekranları girişli önizləmədə açıldı; maliyyə hesabatının beş tabı, kassa və faktura formaları masaüstü/390px telefonda yoxlanıldı. Runtime xətası yoxdur. Şirkət dəyişmə regressiyaları avtomatik testlərdə keçdi; canlı hesabda şirkət dəyişmə seçimi olmadığından canlı sınaq edilmədi. Kassa qalıqları mövcud server funksiyası çatışmazlığı səbəbindən yoxlanmış deyil.
