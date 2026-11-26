# ERP: modul üzrə yoxlama

Tarix: 24 noyabr 2026. Yoxlanmış commit: `52c34c911a53fa9792528f3115e920f3731901b6`.

## Əhatə və nəticə

Bu hesabat mənbə kodu baxışı, mövcud lokal testlər və iki ayrıca hesablama reproduksiyasına əsaslanır. Canlı şirkətdə maliyyə əməliyyatı aparılmayıb. Bu yoxlama production qəbul aktı, vergi uyğunluğu rəyi və ya tam təhlükəsizlik sertifikasiyası deyil. Daha yeni remote commit bu hesabatın əhatəsinə daxil deyil.

- Vitest: **227 fayl, 1 050 test keçdi**, çıxış kodu 0; müddət təxminən 13 dəqiqə 52 saniyə.
- `scrollTo` jsdom xəbərdarlıqları və məqsədli `boom-test` error-boundary çıxışı var; testlər uğursuz deyil.
- Bu keçiddə 21 canlı biznes axını, build, typecheck, production deploy və mobil/desktop vizual yoxlama yenidən icra edilməyib.
- Əvvəlki düzəlişləri açıq problem kimi təkrarlamıram: hesabatda reversed production filtrinin tətbiqi, satınalma sənədlərinin atomik saxlanması, kredit sürətli ödənişində qəpik saxlanması əvvəlki yoxlamada təsdiqlənib.
- **7 konkret tapıntı** aşağıdadır. Digər bölmələrdə yoxlama ehtiyacları ayrıca verilir; onlar təsdiqlənmiş xəta sayılmır.

## Təsdiqlənmiş tapıntılar

### F1 / P1: HR sıfır iş gününü tam ay hesablayır

Mənbə: `src/modules/hr/HrOperationsPanel.jsx:65`, `src/modules/hr/payroll.js:24`.

Panel `workedDays: days || norm` verir; sıfır gün normaya çevrilir. Hesablama funksiyasının özündə də `workedDays && workDays` yoxlaması sıfır üçün nisbəti 1 edir. Bu, məlumatın olmaması ilə faktiki sıfır davamiyyəti ayırmır.

Reproduksiya: `calcPayroll({baseSalary:1000,workDays:22,workedDays:0})` üçün gross=1000, net=889. Eyni girişdə 22 gün də eyni nəticə verir. Panelin `Bağla` əməliyyatı bu netto məbləği approved payroll hadisəsinə yaza bilir (`HrOperationsPanel.jsx:237`). Bu, kassa ödənişinin artıq baş verdiyini sübut etmir, amma səhv əməkhaqqı qeydi yaratmaq riskidir.

Düzəliş: sıfırı qorumaq, çatışmayan davamiyyəti ayrıca vəziyyət kimi göstərmək, qeyri-tam məlumatla bağlanışı bloklamaq və ya açıq təsdiq tələb etmək.

Qəbul testi: 0/22 gün, 10/20 gün, tam ay, davamiyyəti olmayan işçi və məzuniyyət ayrıca yoxlanmalıdır.

### F2 / P1: HR və maliyyədə iki müxtəlif əməkhaqqı qaydası var

Mənbə: `src/modules/hr/payroll.js:19`, `src/shared/lib/hrDomain.ts:152`, `src/shared/lib/financeHelpers.ts:279`.

HR Payroll paneli `calcPayroll`, digər HR/maliyyə hesablamaları `calculatePayrollTax2026` istifadə edir. 1000 AZN üçün birinci funksiya net=889 və incomeTax=0 verir; ikinci funksiya net=885 və incomeTax=24 verir. Tibbi ayırma və yuvarlaqlaşdırma yanaşmaları da fərqlənir.

Bu, hansı vergi formulunun hüquqi baxımdan düzgün olduğu barədə nəticə deyil. Təsdiqlənmiş problem eyni sistemin eyni bruto üçün iki fərqli nəticə verməsidir. Mövcud testlər hər iki qaydanı ayrılıqda təsdiqlədiyindən bütün testlər keçə bilir.

Düzəliş: qüvvəyə minmə tarixi və sektor konfiqurasiyası olan vahid hesablama servisi; bağlanmış payroll üçün qayda versiyası və hesab snapshot-u. Hüquqi qaydalar ayrıca rəsmi mənbə ilə təsdiqlənməlidir.

Qəbul testi: eyni giriş HR kartında, Payroll tabında, maliyyə xərcində və ixracda eyni nəticə verməlidir.

### F3 / P1: CRM 360 ümumi borcu natamam siyahıdan hesablaya bilər

Mənbə: `src/shared/hooks/useCustomer360.js:65`.

`customer_360` RPC nəticəsinin maliyyə yekunları sonradan səhifələnməmiş `orders` sorğusunun cəmi ilə əvəz olunur. API sətir limitini aşan müştəridə sifariş sayı, satış, ödənilən və qalıq borc az göstərilə bilər. Bu kod yolunda pagination və ya tamlığı yoxlayan count yoxdur. Aktiv kreditlərin order ID-ləri ilə filtrində də natamam sifariş siyahısı əlaqəli krediti gizlədə bilər.

Düzəliş: maliyyə yekunlarının sahibi server RPC qalsın; detalları ayrıca səhifələ; məhsul sətirləri üçün ID-ləri paketlə. UI-də natamam detail siyahısını tam yekun kimi təqdim etmə.

Qəbul testi: ən azı 1 001 sifarişli müştəri, köhnə sifarişə bağlı aktiv kredit, sıfır sifariş və ləğv edilmiş sifariş.

### F4 / P2: CRM qismən yükləmə xətasını boş nəticə kimi göstərir

Mənbə: `src/shared/hooks/useCustomer360.js:95`, `:102`, `:106`.

Kredit, sənəd və servis sorğusunun xətası `[]` nəticəsinə çevrilir; `order_items` xətası yoxlanmır. İstifadəçi həqiqi boş siyahı ilə yüklənmə problemini ayıra bilmir. Analytics də bu natamam məlumatla qurulur. Bu, F3-dən fərqli olaraq məlumat sayı az olanda da baş verir.

Düzəliş: hər alt bölmənin loading/error/empty vəziyyəti və retry əməliyyatı olsun; borc və risk göstəriciləri asılı məlumat yüklənmədikdə etibarlı yekun kimi göstərilməsin.

Qəbul testi: kredit sorğusunda 500, sənəd sorğusunda 403, məhsul sorğusunda timeout; heç biri səssizcə “yoxdur” kimi görünməməlidir.

### F5 / P2: Mühasibat qəpikli balanslı yazılışı bloklaya bilər

Mənbə: `src/modules/accounting/AccountingPage.jsx:92`.

Debet və kredit `d === c` ilə müqayisə olunur. Reproduksiya: `0.1 + 0.2 === 0.3` false-dur. Ekranda ikisi də 0.30 görünə bilər, amma submit bloklanır. Sınaq balansında başqa tolerantlıq işlədilməsi də modul daxilində uyğunsuzluq yaradır.

Düzəliş: məbləği giriş sərhədində qəpiyə normallaşdırıb tam ədəd ilə müqayisə et; server decimal qaydası ilə eyniləşdir.

Qəbul testi: 0.10+0.20 / 0.30 qəbul, 0.30 / 0.31 rədd; çoxsətirli jurnal və düzəliş axını.

### F6 / P2: Jurnal ekranında əvvəlki yazılışlara çıxış itir

Mənbə: `src/shared/hooks/useAccounting.js:74`; `AccountingPage.jsx` daxilində JournalPanel.

Sorğu yalnız ən yeni 200 jurnal yazılışını gətirir. Ekranda köhnə səhifəyə keçid və tarix filtri yoxdur. Bazada məlumat silinmir, amma 201-ci və daha köhnə yazılışı bu siyahıdan tapmaq və reversal əməliyyatını açmaq mümkün deyil. Ekrandakı say da yalnız yüklənmiş hissənin sayıdır.

Düzəliş: tarix intervalı, server pagination, stabil ikinci sort açarı və ümumi say. Bütün jurnal tarixçəsini bir dəfə brauzerə yükləmək əvəzinə səhifələnmiş axtarış üstün tutulmalıdır.

Qəbul testi: 250 yazılış, eyni tarixli yazılışlar, ilk/son səhifə və köhnə yazılışın reversal-ı.

### F7 / P2: Sınaq balansında gecikmiş cavab yeni filtri əvəz edə bilər

Mənbə: `src/modules/accounting/AccountingPage.jsx:161`.

Tarix dəyişəndə `load` yenidən çağırılır, amma request token və cleanup yoxdur. A intervalı üçün gecikmiş cavab B intervalının nəticəsindən sonra gələrsə, B tarixləri göstərilən ekranda A rəqəmləri görünəcək. Bu, koddan təsdiqlənən yarış imkanıdır; canlı gecikmə sınağı aparılmayıb.

Düzəliş: tenant+interval scope-u ilə yalnız son cavabı qəbul etmək, dəyişmə zamanı köhnə nəticəni ayırmaq və tenant yoxdursa məlumatı təmizləmək.

Qəbul testi: A gec, B tez cavab versin; son ekran yalnız B-ni saxlamalıdır. Eyni test tenant dəyişməsi üçün də aparılmalıdır.

## Modul üzrə vəziyyət və qəbul meyarları

| Modul | Bu baxışın nəticəsi | Növbəti məcburi yoxlama |
|---|---|---|
| Satış | Mövcud satış forması, submit, reversal, nömrələmə və repository testləri ümumi dəstdə keçdi. Burada yeni təsdiqlənmiş satış xətası çıxarılmayıb. | İki sessiyadan eyni məhsul, request təkrarı, sifariş ləğvi və bağlı maliyyə/stok nəticəsi. |
| Kredit | Aktivləşdirmə, ilkin beh, ödəniş komandası, cədvəl və quick-collect testləri keçdi. Əvvəlki qəpik düzəlişi açıq problem sayılmır. | 5 000 hədəf/1 000 beh/4 000 qalıq; tam behdən əvvəl aktivləşmə bloklansın; reversal sonrası bütün modullar eyni borcu göstərsin. |
| Maliyyə/kassa | Mövcud hesab, settlement və tenant testləri keçdi; HR-dən gələn məbləğ F2 ilə bağlıdır. Test keçməsi canlı ledger uyğunluğunun sübutu deyil. | Eyni idempotency açarı, ikiqat klik, yarımçıq şəbəkə, expense reversal və bağlı dövr. |
| Mühasibat | F5, F6, F7 açıqdır. Create/post/reverse server RPC-ləri istifadə olunur. | Qəpiklər, 200-dən çox jurnal, gecikmiş interval cavabı, bağlı dövrə yazılış. |
| CRM | F3 və F4 açıqdır. Müştəri 360 daha çox məlumat olduqda xüsusi risk daşıyır. | Böyük müştəri tarixçəsi, alt sorğu xətaları, sürətli müştəri dəyişməsi və attachment retry. |
| HR | F1 və F2 ən yüksək prioritetdir. Davamiyyət hər hadisəni bir gün sayır; eyni gündə təkrar hadisənin mümkünlüyü ayrıca DB yoxlaması tələb edir. | Sıfır gün, duplicate attendance, məzuniyyət, dövrün iki dəfə bağlanması və bütün ekranların eyni netto göstərməsi. |
| Satınalma | `useReceiptActions.ts:111` və `useInvoiceActions.ts:112` atomik save RPC-lərindən istifadə edir. Bu əvvəlki boşluğun bağlanmasıdır. | PO -> qismən qəbul -> faktura -> match -> qismən ödəniş -> reversal; sətir xətasında header-in də rollback olması. |
| Anbar | Anbar domain, import və balans testləri keçdi. Son memarlıq qaydası stok yazılışını server komandalarına məhdudlaşdırır. | Son vahidə paralel rezerv, anbarlararası transfer, serial təkrarı, import retry və mənfi stok rəddi. |
| Təhvil/logistika | Shipment oxunması səhifələnmiş və tenant-scope qorunmalıdır. `useShipments.js:40` daxilində köhnə client nömrələmə helper-i qalır. Cari ShipmentsPage create funksiyasını istifadə etmir; buna görə aktiv istifadəçi xətası kimi sayılmayıb. | Helper istifadə ediləcəksə, server nömrələməsinə keçirilsin. Ləğv edilmiş satışın təhvili, qismən təhvil və qalan miqdar canlı yoxlanmalıdır. |
| İstehsal | Reversal və hesabat filtri üçün testlər keçdi; `reportData.js:41` reversed partiyanı çıxarır. | Xammal maya dəyəri ilə geri qaytarılsın; istehlak edilmiş hazır məhsulun reversal-ı bloklansın; mühasibat qarşı yazılışı yoxlansın. |
| Hesabatlar/dashboard | Hesabat RPC, ixrac, tenant, tarix, font və production filtri testləri keçdi. CRM 360 cəmi ümumi report RPC-si ilə qarışdırılmamalıdır. | Eyni interval/anbar üçün KPI, cədvəl, CSV/PDF və ledger tutuşdurulsun. Bu baxışda real faylın vizual render-i yoxlanmayıb. |
| Layihələr/ROI | `buildProjectRoiSummary` ötürülən layihələrdən yekun çıxarır. Buradan mənbə layihə məlumatlarının tamlığı avtomatik sübut edilmir. | Gəlir/xərcin ilkin sənədlə uzlaşması, shared expense bölgüsü, valyuta və sıfır maya üçün ROI. |
| Müqavilələr | Bu keçiddə müqavilənin tam hüquqi və çap axını üzrə nəticə çıxarmaq üçün ayrıca sübut yoxdur. | Müştəri/cihaz/order əlaqəsi, şablon versiyası, tarix, Azərbaycan hərfləri, çap və bağlı obyekt silinməsi. |
| AI | `erp-chat/index.ts:54` tenant yoxlaması və tenant-scoped sorğular görünür; AI tenant testləri keçdi. Bu bütün rol icazələrinin canlı sınağı deyil. | Viewer və məhdud modul rolu ilə sorğu, ikinci tenant ID-si, vaxtı bitmiş sessiya, provider timeout. |
| Bildirişlər | Provayder inteqrasiyası istifadəçinin qərarı ilə təxirə salınıb. `CustomerMessengerPanel` tenant dəyişəndə selection/text-i açıq sıfırlamır; parent lifecycle təsdiqi olmadan bunu aktiv sızma adlandırmıram. | Provider qoşulmadan “göndərildi” deyil, konfiqurasiya vəziyyəti; tenant dəyişməsində recipient reset; retry-də duplicate göndərişin qarşısı. |
| Admin/rollar | Tenant-admin provisioning və tenant isolation testləri keçdi. Tam canlı RLS/rol matrisi bu baxışda yenidən işlədilməyib. | Ayrı read-only hesab; modul icazəsi, admin əlavə etmə uğursuzluğu, ikinci tenant və bağlı obyekt silinməsi. |
| Ayarlar/inteqrasiyalar | Real credential/provider endpoint-ləri bu baxışda sınaqdan keçirilməyib. UI-nin saxlanma uğuru provayderin işləməsi demək deyil. | Maskalanmış secret, server validation, bağlantı testi, audit və failure/retry. |
| Help/onboarding | Maliyyə düzgünlüyü baxımından aşağı prioritet; tam vizual yoxlama aparılmayıb. | Linklərin cari modula getməsi, geri naviqasiya və ilk istifadəçinin boş məlumat vəziyyəti. |

## Test strategiyasındakı boşluq

1 050 testin keçməsi faydalıdır, amma eyni formulun iki variantını ayrıca test etmək sistem səviyyəsində uyğunluğu yoxlamır. Yeni testlər konkret istifadəçi nəticəsini ölçməlidir:

1. Eyni əməkhaqqı girişi üçün HR, Payroll və maliyyə nəticələrinin bərabərliyi.
2. API sətir limitindən böyük tarixçədə server yekununun qorunması.
3. Uğursuz alt sorğunun “boş məlumat” kimi görünməməsi.
4. Sürətli tarix/müştəri/tenant dəyişməsində köhnə cavabın rəddi.
5. Qəpiklə işləyən jurnal, ödəniş, kredit və ixrac uyğunluğu.
6. Eyni commit üzrə lokal gate-lərdən sonra ayrıca tenantda 21 canlı axın və deploy sonrası smoke test.

## Tövsiyə olunan icra sırası

1. F1 və F2: payroll qaydasını vahidləşdir, sıfır/missing davamiyyəti ayır; keçmiş payroll qeydlərini avtomatik dəyişmə, fərq hesabatı hazırla.
2. F3 və F4: CRM yekunlarını serverdə saxla, detalların paging və error vəziyyətini düzəlt.
3. F5 və F6: qəpik müqayisəsi və mühasibat jurnalının səhifələnməsi.
4. F7: sınaq balansının async scope-u; digər hələ scope-suz ekranlar üçün eyni test nümunəsi.
5. Modul cədvəlindəki inteqrasiya qəbul testləri, sonra desktop/mobile görünüş yoxlaması.
6. Yalnız eyni commit-in bütün məcburi gate-ləri və staging biznes axınları keçəndən sonra production buraxılışı.

Bu hesabatda tətbiq kodu dəyişdirilməyib, push və deploy aparılmayıb. Yalnız audit sənədi əlavə olunub.

## Düzəliş mərhələsi: 25 noyabr 2026

Yuxarıdakı hissə ilkin auditin vəziyyətidir. İstifadəçinin sonrakı tapşırığı ilə lokal tətbiq kodunda aşağıdakı dəyişikliklər edildi:

- F1: sıfır iş günü saxlanır; davamiyyət məlumatı olmayan, oxunması davam edən və ya oxuma xətası olan payroll bağlanışı bloklanır.
- F2: Payroll paneli mövcud `calculatePayrollTax2026` funksiyasına bağlandı. Yeni hüquqi vergi formulu təsdiqlənməyib; sistem daxilində iki ayrı formulun istifadəsi aradan qaldırılıb. Əvvəlki bazadakı payroll qeydləri dəyişdirilmir.
- F3: CRM sifariş, kredit və detail sorğuları səhifələnir, məhsul sətirlərinin ID-ləri paketlə göndərilir. Yekunlar artıq limitlə kəsilmiş siyahıdan hesablanmır. Mövcud RPC ləğv edilmiş sifarişləri də topladığı üçün sadəcə onun yekununu saxlamaq düzgün deyil; bu düzəlişdə tam oxunmuş aktiv sifarişlərdən cəm saxlanıb. Yekunun ayrıca, tam uyğun server RPC-yə çıxarılması gələcək optimallaşdırmadır.
- F4: alt sorğu xətalarında etibarsız boş yekun dərc edilmir; kart mövcud xəta və retry ekranına keçir.
- F5: jurnal balansı qəpik vahidində müqayisə edilir.
- F6: jurnal üçün 50 sətirlik server səhifələnməsi, tarix filtrləri və ümumi say əlavə edildi.
- F7: sınaq balansının tenant/tarix sorğuları scope token-i ilə qorunur.
- Əlavə: HR cədvəlinin köhnə sütun formatı yeni DataTable müqaviləsinə uyğunlaşdırıldı; boş görünən sətir və əməliyyat düymələri bərpa edildi.

Yeni regresiyalar 0 iş günü, vahid payroll nəticəsi, 1 001 sifariş, CRM alt sorğu xətaları, qəpik balansı, köhnə jurnal səhifəsi, gecikmiş tarix cavabı və bağlanış düyməsini yoxlayır. Bu mərhələ canlı E2E, vergi uyğunluğu yoxlaması və production deploy təsdiqi deyil.

### Yekun yoxlama: 26 noyabr 2026

- Tam Vitest dəsti: **230 fayl, 1 067 test keçdi**, çıxış kodu 0.
- Lint, TypeScript yoxlaması və build keçdi.
- JS typecheck ratchet: yeni xəta yoxdur; əvvəlki 489 xəta baseline-da qalır.
- Bundle: 405.6 KB, limit 500 KB, keçdi.
- `git diff --check` keçdi.
- Build zamanı Supabase environment dəyişənlərinin olmaması xəbərdarlığı var; build nəticəsi canlı bağlantının təsdiqi deyil.
- Push/deploy və 21 canlı biznes axını bu düzəliş mərhələsində icra edilməyib.

### Remote ilə birləşdirmə

Push hazırlığında `main` artıq `cfaacd9` commit-inə irəliləmişdi. Yeni remote UI dəyişiklikləri saxlanıldı. F6 üçün remote-da əlavə edilmiş “Daha köhnə yazılışları yüklə” mexanizmi qorundu; yuxarıda təsvir olunan lokal 50-sətirlik alternativ və tarix filtrləri bu birləşmiş versiyaya daxil edilmədi. Qəpik müqayisəsi və sınaq balansı qorunması həmin yeni versiyaya əlavə edildi. Əvvəlki 1 067 test nəticəsi rebase-dən əvvəlki versiyaya aiddir; birləşmiş versiyanın buraxılışı ayrıca CI nəticəsinə bağlıdır.
