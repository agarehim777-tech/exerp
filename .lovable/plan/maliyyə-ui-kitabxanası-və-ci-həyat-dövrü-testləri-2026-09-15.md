# Maliyyə UI kitabxanası və CI həyat dövrü testləri

## Məqsəd
Maliyyə, mühasibat, hesabat və dashboard səhifələrini vahid görünüş komponentlərinə keçirmək; səhifələrdə təkrarlanan statik inline stilləri aradan qaldırmaq; satış və xərc həyat dövrlərini CI-də real brauzer və backend ilə avtomatik yoxlamaq.

## İcra mərhələləri

### 1. Ümumi komponent kitabxanasını tamamla
- `Button`, `Card`, `Input`, `Select`, `Field`, `DataTable` komponentlərini mövcud dizayn tokenlərinə və CSS siniflərinə keçir; komponentlərin özündəki hardcoded inline stilləri də çıxar.
- Təkrarlanan nümunələr üçün kiçik primitivlər əlavə et: `PageStack`, `Toolbar`, `FormGrid`, `StatGrid/StatCard`, `Tabs`, `Notice`, `Badge`, `TableActions` və boş/yüklənmə vəziyyətləri.
- Ölçü, ton, aktiv, təhlükəli və ikinci dərəcəli variantları prop-larla idarə et; bütün düymələrdə disabled/focus vəziyyətlərini standartlaşdır.
- Cədvəl komponentini xüsusi hüceyrə renderi, footer, üfüqi daşma, numeric alignment və boş vəziyyətlərlə mövcud səhifələrin ehtiyacına uyğunlaşdır.

### 2. Maliyyə və mühasibat səhifələrini köçür
Bu ardıcıllıqla, hər paketdən sonra davranışı yoxlayaraq:
1. `CurrenciesPage` və `PeriodsPage`
2. `AccountingPage` və onun period/reconciliation panelləri
3. `FinancialStatementsPage` və `ReportsPage`
4. `CashbookPage`
5. `SalesInvoicesPage`
6. `ReceivablesPage`, `TaxPage` və `CreditsPage` daxilində qalan uyğun idarəetmələr

Hər səhifədə:
- Raw `button/input/select/table` elementlərini vahid komponentlərlə əvəz et.
- Təkrarlanan kart, forma, tab, status, toolbar və cədvəl stillərini səhifədən çıxar.
- Statik inline stilləri CSS siniflərinə və semantic tokenlərə köçür.
- Yalnız məlumatdan asılı həqiqi dinamik ölçüləri CSS custom property ilə saxla; rəng və digər vizual dəyərləri inline yazma.
- Mövcud mətnləri, icazələri, hesablamaları, sorğuları və əməliyyat davranışını dəyişmə.

### 3. Dashboard-ları vahid dilə gətir
- Əsas dashboard və satış dashboard kartlarını, toolbar-ları, performans siyahılarını və qrafik konteynerlərini ümumi komponentlərlə uyğunlaşdır.
- Qrafik hündürlüyü/proqres kimi dinamik göstəriciləri semantic CSS dəyişənlərinə keçir.
- Mobil sürətli əməliyyat düymələrini ümumi `Button` variantları ilə göstər, mövcud URL keçidlərini saxla.

### 4. Bütün tətbiq üzrə inline-style auditi
- Maliyyə/dashboard mərhələsindən sonra bütün `src` daxilində ikinci audit apar.
- Digər aktiv səhifələrdə eyni təkrarlanan Button/Card/Input/Select/Table nümunələrini komponent kitabxanasına keçir.
- Modal və unikal layout stillərini ayrıca mənalı CSS siniflərinə çıxar; eyni görünüşü ikinci dəfə yaratma.
- Avtomatik audit skripti əlavə et: səhifə/modul fayllarında yeni statik inline stil və raw əsas idarəetmə əlavə olunarsa CI xəbər versin. Dinamik CSS custom property istifadəsi üçün dar istisna saxla.

### 5. Satış həyat dövrü E2E testi
CI-də təcrid olunmuş test məlumatı ilə aşağıdakı ssenarini əlavə et:
- Authenticated tenant sessiyasını bərpa et və test müştərisi/məhsulu hazırla.
- Satış sifarişi yarat; ödəniş qeydinin və Əsas kassanın avtomatik yaradılmasını/aktivləşməsini yoxla.
- Kassa mədaxilini, sifarişin ödənilmiş məbləğini və siyahıda görünməsini təsdiqlə.
- Satışı ləğv et; reversal yazısını, sıfırlanmış ödənişi və aktiv satış siyahısından çıxmasını yoxla.
- Səhifəni yenilə və ləğv edilmiş satışın geri qayıtmadığını təsdiqlə.
- `afterEach` təmizliyi ilə yalnız həmin testin unikal prefiksli məlumatlarını sil.

### 6. Xərc həyat dövrü E2E testi
CI-də təcrid olunmuş test məlumatı ilə:
- Yeni xərc yarat və “təsdiq gözləyir” statusunu yoxla.
- Xərci təsdiqlə, sonra qəbul et; status sütunlarını və Əsas kassadakı məxarici yoxla.
- Xərci ləğv et; əks yazılışı və əvvəlki kassa qalığının bərpasını yoxla.
- Səhifəni yenilə; xərcin “Ləğv edildi” kimi qalmasını və aktiv məxaricə yenidən daxil edilməməsini təsdiqlə.
- Test məlumatlarını etibarlı şəkildə təmizlə.

### 7. CI və yoxlama qapıları
- Həyat dövrü testlərini ayrıca Playwright layihəsi/tag-i kimi işə sal və CI-də mövcud authenticated E2E mərhələsinə qoş.
- Paralel məlumat toqquşmasını dayandırmaq üçün bu iki mutasiya testini serial işə sal; unikal run ID istifadə et.
- Uğursuzluqda screenshot, trace və test nəticələrini artifact kimi saxla.
- CI ardıcıllığı: unit/integration testləri → build → UI audit → kritik Playwright həyat dövrləri → bundle budget.
- Lokal credential olmadıqda testləri aydın səbəblə skip et; CI-də tələb olunan secret yoxdursa job dərhal və izahlı şəkildə dayansın.

## Texniki qeydlər
- Yeni vizual dəyərlər qlobal semantic tokenlərdə və komponent CSS-ində olacaq; səhifələrdə hardcoded rəng yaradılmayacaq.
- Mövcud `src/components/ui.jsx` və `src/shared/ui/primitives.jsx` paralel kitabxana kimi saxlanmayacaq: uyğun API qorunaraq bir vahid mənbəyə yönəldiləcək.
- Data və biznes məntiqi dəyişdirilməyəcək; E2E testləri mövcud əməliyyat funksiyalarını real istifadəçi addımları ilə doğrulayacaq.
- Test selektorları görünən Azərbaycan dilində rollara əsaslanacaq; yalnız qeyri-sabit yerlərdə məqsədli `data-testid` əlavə ediləcək.

## Qəbul meyarları
- Aktiv maliyyə, mühasibat, hesabat və dashboard səhifələrində təkrarlanan statik inline stil qalmır.
- Tətbiq üzrə audit yeni təkrarlanan raw Button/Card/Input/Table istifadəsini bloklayır.
- Görünüş və bütün mövcud əməliyyatlar desktop və mobil ölçülərdə pozulmur.
- Satış və xərc həyat dövrü testləri refresh sonrası vəziyyəti və kassa təsirini yoxlayaraq CI-də keçir.
- Mövcud Vitest, Playwright, build və bundle limitləri keçir.
