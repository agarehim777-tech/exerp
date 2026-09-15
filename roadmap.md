# ExERP təkmilləşdirmə yol xəritəsi

1. [x] Kadr və maliyyə siyahılarını (işçi, şöbə, məzuniyyət, vakansiya, müqavilə, kassa qeydləri, hesablar, kreditlər) ayrıca sətir-sətir bazaya köçürmək — `tenant_collection_records` cədvəli + `useCollectionSync`
2. [x] Ölü səhifələri silmək (FinancePage, köhnə AccountingPage)
3. [x] Çatışmayan xarici açar indekslərini əlavə etmək (19 indeks)
4. [x] Yeni saxlama məntiqi üçün testlər (175 test keçir) + canlı yoxlama: işçi əlavə → yenidən yükləmə → qalır
5. [x] Paket bölgüsü yoxlanıldı — PDF və qrafiklər onsuz da yalnız lazım olanda yüklənir; ümumi vendor birləşdirmə daha pis nəticə verdiyi üçün saxlanılmadı
6. [~] Ümumi komponentlər (`src/shared/ui/primitives.jsx`: Button, Card, Input, Select, Field, DataTable) hazırdır; səhifələrin bu komponentlərə tədricən keçirilməsi davam edir
