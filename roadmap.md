# ExERP təkmilləşdirmə yol xəritəsi

1. [x] Kadr və maliyyə siyahılarını (işçi, şöbə, məzuniyyət, vakansiya, müqavilə, kassa qeydləri, hesablar, kreditlər) ayrıca sətir-sətir bazaya köçürmək — `tenant_collection_records` cədvəli + `useCollectionSync`
2. [x] Ölü səhifələri silmək (FinancePage, köhnə AccountingPage)
3. [x] Çatışmayan xarici açar indekslərini əlavə etmək (19 indeks)
4. [x] Yeni saxlama məntiqi üçün testlər (175 test keçir) + canlı yoxlama: işçi əlavə → yenidən yükləmə → qalır
5. [x] Paket bölgüsü yoxlanıldı — PDF və qrafiklər onsuz da yalnız lazım olanda yüklənir; ümumi vendor birləşdirmə daha pis nəticə verdiyi üçün saxlanılmadı
6. [~] Ümumi komponentlər CSS/token əsaslı vahid kitabxanaya çevrildi; maliyyə, mühasibat, hesabat və dashboard səhifələrinin mərhələli keçidi davam edir
7. [x] Satış və xərc həyat dövrü integration/E2E testləri ayrıca serial CI qapısı ilə əlavə edildi

## Təsdiqlənmiş yeni mərhələlər
8. [ ] İstifadəsiz qalıqlar və 53 lint xəbərdarlığının aradan qaldırılması
9. [ ] TypeScript təməli və böyük tətbiq/domen fayllarının bölünməsi
10. [ ] Bütün ekranlarda vahid komponent və stil keçidi
11. [ ] Kadr/maliyyə kolleksiyalarının xüsusi cədvəllərə təhlükəsiz keçidi
12. [ ] Qalan TypeScript keçidi, səhifələmə və son canlı yoxlamalar
