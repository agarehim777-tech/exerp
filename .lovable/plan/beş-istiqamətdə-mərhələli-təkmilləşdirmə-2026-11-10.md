# Beş istiqamətdə mərhələli təkmilləşdirmə

## Məqsəd
Mövcud əməliyyatları və məlumatları qoruyaraq böyük faylları bölmək, təkrar stilləri aradan qaldırmaq, 53 kod xəbərdarlığını həll etmək, TypeScript keçidini tamamlamaq və kadr/maliyyə məlumatlarını uyğun ayrıca cədvəllərə köçürmək. Tam yenidən yazılma aparılmayacaq.

## Təsdiqlənmiş vəziyyət
- `App.jsx`: 3 053 sətir; məlumat yükləmə, əməliyyatlar, naviqasiya və səhifələrin göstərilməsi eyni yerdədir.
- Böyük məntiq başqa fayllarda da qalır: `appDomain.jsx` 4 427, `appHelpers.jsx` 3 550 sətirdir. Sadəcə kodu bu fayllara köçürmək həll deyil.
- İlkin auditdə 1 845 inline stil istifadəsi və 53 lint xəbərdarlığı var; lint xətası yoxdur.
- TypeScript qisməndir: 357 JS/JSX və 19 TS/TSX faylı; `checkJs` söndürülüb.
- Səkkiz kolleksiya `useCollectionSync` vasitəsilə ümumi JSON məlumatlı cədvəldə saxlanılır. Xərclərin ayrıca cədvəli və ayrıca oxuma yolu artıq var.
- Ümumi kolleksiya oxucusu səhifəli sorğular versə də, bütün qeydləri tətbiq yaddaşına yığır; bəzi digər oxucularda sabit nəticə limitləri var.
- Başlanğıc yoxlaması: 139 test faylında 622 test keçir. Satış, xərc, kredit və təhvil ssenariləri CI-də mövcuddur; bu auditdə canlı icra edilməyib.

## İcra ardıcıllığı

### 1. Köhnə qalıqlar və kod xəbərdarlıqları
İstifadəsiz dəyişən/importları təmizləmək, köhnə səhifə və yardımçı funksiyaların həqiqətən istifadə olunmadığını yoxlayaraq silmək. Təkrarlanan hesablamaları müqayisə edib eyni məntiqli olanları birləşdirmək. Məlumat yenilənməsi xəbərdarlıqlarını kor-koranə asılılıq əlavə etmədən düzəltmək; sonsuz yenilənmə və köhnə şirkət məlumatı risklərini test etmək. Xəbərdarlıqları gizlədən istisnalar əlavə etməmək.

**Yoxlama:** lint-də sıfır xəbərdarlıq, bütün mövcud testlər, şirkət dəyişmə və səhifə yenilənməsinin önizləmədə yoxlanması.

### 2. TypeScript təməli və böyük faylların bölünməsi
Əvvəl domen tipləri, məlumat çeviriciləri və ortaq komponentlər üçün tiplər yaratmaq. `App.jsx`-dən naviqasiya, səhifə seçimi, pəncərələr və modul əməliyyatlarını ayrıca məqsədli hissələrə çıxarmaq. `appDomain` və `appHelpers` məntiqini aid olduğu modullara bölmək; yeni monolit yaratmamaq. Köhnə importlar üçün lazım olan uyğunluq qatını yalnız keçid müddətində saxlamaq, istifadə qalmadıqda silmək.

**Yoxlama:** hər çıxarılan hissədən sonra əlaqəli testlər və önizləmədə aid olduğu ekran; URL, icazə və əməliyyat davranışı dəyişməməlidir.

### 3. Vahid görünüş keçidini tamamlamaq
Mövcud Button/Card/Input/Select/DataTable və rəng tokenlərini əsas götürmək. Əvvəl maliyyə, mühasibat və dashboard, sonra satış/kredit, kadr və qalan səhifələri kiçik qruplarla keçirmək. Sabit inline stilləri ortaq siniflərə çevirmək; dinamik qrafik və ölçü dəyərlərini təkrar dekorativ stillərdən ayrı qiymətləndirmək. Ekran bölmələrinə lazımsız əlavə kartlar qoymamaq, hazırkı görünüş və funksiyaları qorumaq.

**Yoxlama:** hər qrupdan sonra masaüstü və telefon ölçülərində ekran yoxlaması, cədvəl/form/pəncərə qarşılıqlı əməliyyatları; auditdə qalan dinamik istisnaların ayrıca siyahısı.

### 4. Kadr və maliyyə məlumatlarını ayrıca cədvəllərə keçirmək
Canlı sxem və mövcud xüsusi cədvəlləri yoxlamaq; varsa yenisini yaratmadan onlardan istifadə etmək. Kadr məlumatlarından başlayaraq şöbə, əməkdaş, məzuniyyət, vakansiya və müqavilələri keçirmək. Sonra kassa qeydləri, hesablar və kreditlər üçün artıq mövcud maliyyə mənbələri ilə uyğunlaşdırma aparmaq. Hər kolleksiyada əvvəl təkrarlana bilən köçürmə və tutuşdurma, sonra oxuma/yazmanın bir mənbəyə keçirilməsi. Köhnə məlumatları təsdiqlənmiş say və məbləğ uyğunluğu olmadan silməmək. Ümumi cədvələ paralel yazmanı dayandırmaq.

**Yoxlama:** hər kolleksiya üçün köhnə/yeni say və identifikator müqayisəsi, maliyyə məbləğlərinin uyğunluğu, yarat → yenilə → yenidən yüklə → ləğv/sil → yenidən yüklə ssenarisi və şirkətlərarası izolyasiya. Baza dəyişiklikləri layihənin migration fayllarında saxlanılacaq.

### 5. Qalan TypeScript keçidi və məlumat oxucuları
Modul-modul qalan JS/JSX fayllarını TypeScript-ə çevirmək; test və konfiqurasiya fayllarının uyğun hissələrini də əhatə etmək. `any`, ikiqat məcburi çevirmə və susdurucu şərhlərlə səhvləri örtməmək. Siyahılarda səhifələmə, yekunlarda tam məlumatı əhatə edən hesablama tətbiq etmək; sabit limitin nəticələri səssiz kəsməsinə yol verməmək. Keçid tamamlandıqda qalmış uyğunluq qatlarını silmək.

**Yoxlama:** avtomatik tip yoxlamasını CI-yə əlavə etmək; böyük məlumat dəsti ilə səhifələmə və hesabat uyğunluğu testləri; bütün testlər və əsas canlı axınlar.

## Texniki qaydalar
- Mövcud React/Vite quruluşu və UI kitabxanası qorunur; yeni server və ya framework əlavə edilmir.
- Sxem dəyişikliklərində Lovable Cloud qaydaları, şirkət üzrə RLS və GRANT tələbləri tətbiq edilir.
- Hər mərhələ ayrıca tamamlanır və önizləmədə yoxlanır; sonrakı mərhələ əvvəlki təsdiqlənənədək başlamır.
- İcra zamanı `roadmap.md` yenilənir, struktur qərarları `AGENTS.md`-də qeyd olunur.
- Tamamlanma meyarı yalnız fayl sayının azalması deyil: işlək ekranlar, bir məlumat mənbəyi, sıfır lint xəbərdarlığı və keçən avtomatik yoxlamalardır.

## Sərhədlər
Bu plan təhlükəsizlik sertifikatı və ya ayrıca təhlükəsizlik auditi deyil. CI-də canlı yoxlama üçün tələb olunan test hesabı və icazələr əldə edilməzsə, həmin yoxlamalar tamamlanmış kimi göstərilməyəcək.