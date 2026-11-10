# ExERP təkmilləşdirmə yol xəritəsi

## 10 noyabr: tamamlanma tələbi
- [x] Kadr/maliyyə üçün 7 xüsusi cədvəl və employees genişləndirilməsi; ümumi cədvəlin yazılışı bağlandı. Əməkdaş yaratma → reload canlı yoxlandı; köçürüləcək ümumi qeydlərin sayı 0 idi.
- [~] TypeScript saxlama adapteri, saxlama hook-u və şirkət sorğu qorunması; CI/release tip qapısı keçir. Bütün JS/JSX fayllarının keçidi və checkJs hələ tamamlanmayıb.
- [x] Satış yaradılması, anbar, məhsul, vendor və maliyyə hesabı əməliyyatları 5 fokuslu modula çıxarıldı; App 2618 → 1441 sətir.
- [~] Kadr əməliyyatları, icazələr, uyğunluq yoxlaması, KPI və borc ekranlarında inline stillər sıfırlandı. Digər ekranlarda qalan stillər tamamlanmayıb; əvvəlki 122 sayı düzgün deyil, bu yoxlamada əvvəl 885 istifadə aşkarlandı.
- [~] KPI və debitor funksiyaları canlı tətbiq edildi; 7 integration testi keçir. 10 ₼ satış borcu UI-dən bağlandı, reload və tarixçə yoxlandı, satış əks yazıldı. KPI ödənişi canlı ayrıca yoxlanmayıb.
- [~] İki anonim reversal funksiyasının icazələri bağlandı, təhlükəli current_user yoxlaması düzəldildi və bonus funksiyasına şirkət/icazə qorunması əlavə edildi. Anonim xəbərdarlıq 0; girişli funksiyalar üçün 79 audit xəbərdarlığı qalır, hamısı ayrıca təhlil edilməyib.

Yoxlama: 141 fayl üzrə 631 test keçdi; tip qapısı keçir; son önizləmə yığımı uğurludur. Sınaq əməkdaşı silindi, sınaq satışının maliyyə təsiri əks yazıldı; 10 ₼ bağlanış və ləğv audit tarixçəsi saxlanıldı.

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
11. [x] Kadr/maliyyə kolleksiyaları xüsusi cədvəllərə keçirildi; ümumi keçid cədvəli istifadədən çıxarıldı, yeni əməkdaşın reload yoxlaması keçdi.
12. [~] CI tip qapısı əlavə edildi; bütün JavaScript fayllarının tip keçidi və son geniş canlı yoxlamalar tamamlanmayıb.

## Cari panel keçidi
- [x] Müştəri detalları: Button/Card/Input/Select/Tabs/DataTable keçidi; mərhələ üzrə 10 test keçdi
- [x] Müştəri siyahısı: vahid elementlər, cədvəl və formalar; mərhələ üzrə 12 test keçdi
- [x] Sifariş paneli: vahid elementlər və cədvəl; mərhələ üzrə 13 test keçdi
- [x] Son yoxlama: 624 test keçdi, lint xətasızdır; girişli real müştəri/sifariş panelləri masaüstü və 390px telefonda açıldı, runtime xətası və üfüqi daşma yoxdur. Bu üç faylda inline style və yerli HTML düymə/input/select/table qalmadı; maliyyə əməliyyatları dəyişdirilmədi.

Yoxlama: dashboard, təhvil, kredit, mühasibat, HR ekranları girişli önizləmədə açıldı; maliyyə hesabatının beş tabı, kassa və faktura formaları masaüstü/390px telefonda yoxlanıldı. Runtime xətası yoxdur. Şirkət dəyişmə regressiyaları avtomatik testlərdə keçdi; canlı hesabda şirkət dəyişmə seçimi olmadığından canlı sınaq edilmədi. Kassa qalıqları mövcud server funksiyası çatışmazlığı səbəbindən yoxlanmış deyil.

## 10 noyabr: kod təmizliyi
- [x] Pul formatı (formatAmount) və satışa yararlı qalıq (stockMath.sellableQty) vahid funksiyaya yığıldı
- [x] Uyğunluq, sağlamlıq və kadr oxumaları hissə-hissə tam oxunur (limit 1000/5000 kəsilmələri silindi)
- [x] appDomain.jsx 6 bölməyə bölündü (Finance/Hr/Platform/Procurement/Sales/Warehouse); köhnə fayl yalnız ötürücüdür
- [x] ProcurementPage 2252 → 1248 sətir; tablar və ortaq hissələr ayrı fayllarda
- [x] Hesabatın əsas kartları (gəlir, xərc, istehsal, müştəri, sifariş sayı) bazadakı report_totals ilə hesablanır; anbar filtri seçiləndə köhnə hesablamaya keçir
