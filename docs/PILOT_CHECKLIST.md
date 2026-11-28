# ExERP pilot yoxlama siyahısı

Məqsəd: sistemi 1–2 real şirkətdə 4–6 həftə nəzarətli şəkildə işlətmək, köhnə uçotu (Excel / 1C / kağız) paralel saxlamaq və tam keçiddən əvvəl rəqəmlərin uyğunluğunu sübut etmək.

Hər bənd bitəndə `[ ]` → `[x]` edin və yanına tarix + kim yoxladığını yazın.

---

## 1. Pilotdan əvvəl — mütləq (bloklayıcı)

Bunlar bitmədən real müştəri məlumatı daxil edilmir.

### Təhlükəsizlik
- [ ] **DB parolu dəyişdirilib.** Köhnə şifrəsiz backup-lar ictimai repoda olub. Supabase (Lovable Cloud) DB parolu yenilənib, GitHub `SUPABASE_DB_PASSWORD` secret-i yeni parolla əvəzlənib, sonra `Supabase Backup` əl ilə işə salınıb və uğurlu bitib.
- [ ] **`BACKUP_DECRYPTION_KEY` secret-i əlavə olunub** (`backup-key.pem` faylının tam məzmunu). Açarın ikinci nüsxəsi parol menecerində / oflayn yerdədir.
- [ ] Repo ictimaidir: GitHub-un "Secret scanning" xəbərdarlıqları (Security bölməsi) boşdur, repoda `.env`, parol və ya `service_role` açarı yoxdur.
- [ ] Production admin hesabında güclü parol və mümkünsə MFA aktivdir.

### Backup və bərpa
- [ ] Gecəlik backup ən azı 3 gecə ardıcıl uğurlu olub və artefakt yalnız `backup.tgz.cms` + `SHA256SUMS` saxlayır.
- [ ] **Bərpa sınağı yeni şifrəli formatla keçib:** ehtiyat layihə README_DEPLOYMENT.md-dəki SQL ilə boşaldılıb, `Supabase Restore Drill` `RESTORE` təsdiqi ilə işlədilib və uğurlu bitib.
- [ ] Bərpa olunmuş bazada əl ilə yoxlanıb: tenant sayı, müştəri sayı, son satış sifarişi, son kredit ödənişi productiondakı ilə eynidir.
- [ ] (Tövsiyə) Ofsayt nüsxə: `BACKUP_S3_URI` + AWS secret-ləri qurulub, yoxsa backup yalnız GitHub-dadır.

### Monitorinq
- [ ] **Sentry qurulub:** `VITE_SENTRY_DSN` secret-i əlavə olunub, sayt yenidən deploy olunub, test xətası Sentry-də görünür.
- [ ] Sentry-də e-poçt bildirişi yeni xəta növü üçün aktivdir.
- [ ] Xarici uptime yoxlaması (məs. UptimeRobot) sayt ünvanına hər 5 dəqiqədən bir baxır.
- [ ] `Operational Health` workflow-u son 7 gündə yaşıldır.

### Deploy olunmamış hissələr
- [ ] `platform-provision-admin` edge function Lovable vasitəsilə yenidən deploy olunub (rollback düzəlişi, #138).
- [ ] Bütün `supabase/migrations` productiona tətbiq olunub (`Migrate Production Database` plan rejimi "up to date" göstərir).

### Rollar və icazələr
- [ ] Standart `member` rolunun dəstək (support) bileti yarada bilməməsi qərarlaşdırılıb: ya rola icazə verilib, ya da pilot istifadəçilərinə uyğun rol təyin olunub.
- [ ] Hər pilot istifadəçisi üçün minimum lazımi rol seçilib (satış, kassa, anbar, mühasib, rəhbər). Heç kim lazımsız yerə `owner`/`admin` deyil.

---

## 2. Pilot şirkətin qurulması

- [ ] Pilot şirkət(lər) seçilib: kiçik/orta, 3–10 istifadəçi, kreditlə satış və anbarı olan, köhnə uçotunu paralel apara bilən.
- [ ] Yazılı razılaşma: pilot müddəti, məlumatın məxfiliyi, köhnə sistemin paralel saxlanması, dəstək kanalı və cavab müddəti.
- [ ] Tenant yaradılıb, owner dəvət olunub (parol mənbə kodunda saxlanmır).
- [ ] Başlanğıc qalıqlar daxil edilib və köhnə sistemlə tutuşdurulub:
  - [ ] Kassa/bank hesabları və qalıqları
  - [ ] Məhsul kataloqu, anbarlar, anbar qalıqları (say + maya dəyəri)
  - [ ] Müştərilər (FIN/VÖEN təkrarlanmır)
  - [ ] Aktiv kredit müqavilələri və qalan ödəniş qrafiki
  - [ ] Təchizatçılar və açıq borclar
  - [ ] İşçilər və əmək haqqı məlumatları
- [ ] İstifadəçilərə 1 saatlıq təlim keçilib (satış → kredit → ödəniş qəbulu → kassa → anbar hərəkəti → hesabat).

---

## 3. Pilot zamanı — həftəlik yoxlama

Hər həftə (məs. cümə) bir məsul şəxs doldurur:

| Yoxlama | 1-ci həftə | 2-ci | 3-cü | 4-cü |
|---|---|---|---|---|
| Kassa qalığı ExERP = köhnə uçot | | | | |
| Anbar qalığı (5 təsadüfi məhsul) uyğundur | | | | |
| Kredit portfeli və gecikmiş ödənişlər uyğundur | | | | |
| Satış həcmi (həftəlik) uyğundur | | | | |
| Debitor borcları uyğundur | | | | |
| Sentry-də yeni kritik xəta yoxdur | | | | |
| Gecəlik backup-lar hamısı uğurludur | | | | |
| İstifadəçi şikayətləri qeydə alınıb və cavablanıb | | | | |

Uyğunsuzluq tapılarsa: fərqi, tarixi, sənəd nömrəsini qeyd edin. Səbəb tapılana qədər həmin modulda yeni əməliyyatları köhnə sistemdə davam etdirin.

### Ayda bir dəfə
- [ ] **Mühasib əmək haqqı hesablamasını yoxlayıb:** 3 işçi üçün gəlir vergisi, DSMF, işsizlikdən sığorta, icbari tibbi sığorta (2% / 0.5%) əl ilə hesablanıb və ExERP ilə qəpiyinə qədər uyğundur.
- [ ] Ay bağlanışı (month-close) yoxlama siyahısı keçilib, dövr kilidlənib.
- [ ] Bərpa sınağı təkrarlanıb.

---

## 4. Ciddi xəta zamanı plan

1. Problemi Sentry / istifadəçi şikayəti / uyğunsuzluq ilə qeydə alın (ekran şəkli, vaxt, istifadəçi, sənəd nömrəsi).
2. Məlumat itkisi və ya səhv məbləğ varsa: həmin modulda işi dayandırın, köhnə sistemdə davam edin.
3. Frontend xətası: səhvə səbəb olan commit-i `main`-də geri qaytarın (`git revert <sha>` ilə PR açıb merge edin). Pages deploy-u əl ilə işə salınmır: yalnız `main`-ə push-dan sonra CI uğurlu bitəndə avtomatik başlayır, ona görə də geri qaytarma da adi CI → deploy yolu ilə gedir. Bu vaxt ərzində (təxminən 30–40 dəq) problemli modulda işi köhnə sistemdə davam etdirin.
4. Baza xətası: miqrasiyanı geri çəkməyin. Yalnız sınaqdan keçmiş irəli düzəliş (forward-fix) miqrasiyası tətbiq edin.
5. Məlumat bərpası lazımdırsa: əvvəlcə ehtiyat layihəyə bərpa edin, lazımi sətirləri oradan yoxlayın. Production bərpası yalnız platforma sahibi və maliyyə sahibinin təsdiqi ilə.

---

## 5. Pilotdan çıxış meyarları (tam keçid üçün)

Bunların hamısı yerinə yetirilməlidir:

- [ ] Ardıcıl 4 həftə kassa, anbar, kredit və satış rəqəmləri köhnə uçotla uyğundur (izah olunmamış fərq yoxdur).
- [ ] Mühasib ən azı bir tam ayın əmək haqqını və vergi hesablamalarını təsdiqləyib.
- [ ] Son 2 həftədə Sentry-də həll olunmamış kritik xəta yoxdur.
- [ ] Ən azı 2 uğurlu bərpa sınağı (biri pilot dövründə).
- [ ] İstifadəçilər əsas əməliyyatları köməksiz edir; açıq şikayətlərin hamısı cavablanıb.
- [ ] Pilot şirkət rəhbəri yazılı razılıq verib.

Sonra: köhnə sistem yalnız oxumaq üçün 1 ay saxlanılır, sonra arxivlənir.
