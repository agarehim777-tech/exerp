# ERP+CRM AZ Production Deployment

Bu repo Vite/React frontend-dir. Docker image statik frontend-i Nginx ile servis edir. Satis, kredit, anbar, kassa ve audit melumatlari real production istifadede mutleq backend API ve transaction-li DB uzerinden islemelidir.

## Local release yoxlamasi

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run verify:deploy
npm.cmd run smoke:prod
```

## SQLite API ve real sessiya

Frontend lokal rejimde brauzer davamlılığını saxlayır. Real istifadəçi girişi, server audit reyestri və SQLite state davamlılığı üçün API-ni ayrıca başladın:

```powershell
$env:ERP_BOOTSTRAP_PASSWORD='Agarehim1996'
$env:ERP_BOOTSTRAP_EMAIL='Agarehim777@gmail.com'
npm.cmd run api
```

Başqa terminalda frontend-i public API ünvanı ilə başladın:

```powershell
$env:VITE_API_BASE_URL='http://127.0.0.1:8787'
npm.cmd run dev
```

SQLite faylı standart olaraq `data/erpaz.sqlite` ünvanında saxlanır və git-ə əlavə edilmir. İlk giriş yalnız `ERP_BOOTSTRAP_PASSWORD` ilə yaradılmış administrator hesabı ilə mümkündür. Production mühitində API-ni reverse proxy arxasında işlədin, `ERP_DB_PATH`, `ERP_CORS_ORIGIN` və bootstrap məlumatlarını server secret-ləri kimi verin.

## Neon Postgres API

`DATABASE_URL` veriləndə API SQLite əvəzinə Neon/Postgres istifadə edir. Neon connection string-i yalnız backend host-da secret kimi saxlayın:

```powershell
$env:DATABASE_URL='postgresql://USER:PASSWORD@HOST/DB?sslmode=require'
$env:ERP_BOOTSTRAP_PASSWORD='Agarehim1996'
$env:ERP_BOOTSTRAP_EMAIL='Agarehim777@gmail.com'
$env:ERP_CORS_ORIGIN='https://agarehim777-tech.github.io'
npm.cmd run api
```

Frontend build üçün yalnız public API ünvanı yazılır:

```powershell
$env:VITE_API_BASE_URL='https://sizin-render-api.onrender.com'
npm.cmd run build:pages
```

`DATABASE_URL` frontend-ə, GitHub Pages env-lərinə və ya `VITE_` dəyişənlərinə yazılmır.

### GitHub Pages + real backend sync

GitHub Pages build-i statik frontend-dir. Lokal `http://127.0.0.1:5174` üzərində yaradılan müştəri və sifarişlərin `https://agarehim777-tech.github.io/ERP/` səhifəsində görünməsi üçün hər iki frontend eyni backend API-yə qoşulmalıdır.

GitHub repository `Settings -> Secrets and variables -> Actions -> Variables` hissəsində bunları yaradın:

```text
VITE_API_BASE_URL=https://sizin-render-api.onrender.com
VITE_DB_PROVIDER=postgres
VITE_AUDIT_MODE=immutable
```

Render API servisində `ERP_CORS_ORIGIN` dəyəri GitHub Pages origin-i ilə uyğun olmalıdır:

```text
ERP_CORS_ORIGIN=https://agarehim777-tech.github.io
```

Əgər `VITE_API_BASE_URL` boş qalsa, GitHub Pages backend-ə qoşulmur və məlumatları yalnız həmin domenin browser storage-ində saxlayır. Bu halda lokalda yaradılan müştərilər GitHub Pages-də görünməyəcək.

## Production hardening qatları

Backend API artıq aşağıdakı production yoxlama endpoint-lərini verir:

```text
GET  /api/health
GET  /api/ops/deployment
GET  /api/backups
POST /api/backups
POST /api/restore
```

Əsas tələblər:

- `DATABASE_URL` yalnız backend host-da secret kimi saxlanmalıdır.
- `ERP_WEBHOOK_SIGNING_SECRET`, `SMS_API_KEY`, `SMTP_URL`, `PAYMENT_API_KEY` frontend-ə verilməməlidir.
- Backup/restore yalnız autentifikasiyalı istifadəçi ilə, restore isə yalnız `Super Admin` ilə işləyir.
- Audit log serverdə hash-chain metadata ilə saxlanır: `immutable-hash-chain`.
- Deploy sonrası minimum yoxlama:

```powershell
npm.cmd run smoke:api
npm.cmd run build
npm.cmd run audit:flows
```

Admin paneldə `Ayarlar -> Production Hardening` hissəsində backend, backup/restore, deployment monitorinqi, provider readiness və kod parçalanması statusu yoxlanır.

### Render API service

Render-də backend üçün static frontend Dockerfile deyil, Node API servisi işləməlidir.

Variant A - Native Node Web Service:

- Build command: `npm ci`
- Start command: `npm run api`
- Health check path: `/api/health`

Variant B - Docker Web Service:

- Dockerfile path: `Dockerfile.api`
- Health check path: `/healthz`

Env-lər:

```text
DATABASE_URL=Neon connection string
ERP_BOOTSTRAP_EMAIL=Agarehim777@gmail.com
ERP_BOOTSTRAP_PASSWORD=Agarehim1996
ERP_CORS_ORIGIN=https://agarehim777-tech.github.io
```

Əgər `/api/health` HTML qaytarırsa, Render servisi API yox, static frontend kimi qalxıb. Bu halda service settings-də runtime/start command və ya Dockerfile path-i yuxarıdakı kimi dəyişin.

`smoke:prod` build olunmus `dist` qovlugunu 127.0.0.1:4173-de acir, 25 modulu, Settings integrity/go-live axinlarini ve mobil overflow-u yoxlayir.

## Public build environment

`.env.example` yalniz numunedir. `VITE_` ile baslayan her deyer brauzer bundle-ine yazilir. API key, DB parolu, SMTP parolu, JWT signing key ve ya basqa sirr burada yazilmir.

- `VITE_API_BASE_URL`: public backend API unvani
- `VITE_DB_PROVIDER`: `sqlite`, `postgres`, `supabase` ve ya secilmis provider
- `VITE_AUDIT_MODE`: production ucun `immutable`
- `VITE_RELEASE_VERSION`: release identifikatoru

`.env`, `.env.local` ve `.env.production` Docker build context-den qesden xaric edilir. CI/CD-de ehtiyac olan public `VITE_` deyerlerini build arg kimi verin.

## Docker

```powershell
docker build `
  --build-arg VITE_APP_ENV=production `
  --build-arg VITE_DB_PROVIDER=postgres `
  --build-arg VITE_RELEASE_VERSION=1.0.0 `
  -t erpaz-operations-suite:1.0.0 .

docker run --rm -p 8080:80 erpaz-operations-suite:1.0.0
Invoke-WebRequest http://127.0.0.1:8080/healthz
```

Image SPA route-larini `index.html`-e yonlendirir, asset-leri cache-leyir, HTML-i cache-den qoruyur ve CSP, HSTS, Referrer, Permissions, frame ve content-type tehlukesizlik basliqlarini verir.

## Real muhit serhadi

- Container-i internet-e birbasa acmayin. TLS sertifikatini load balancer, ingress ve ya reverse proxy uzerinde qurasdirin.
- 80 portuna yalniz TLS terminator-un daxil olmasina icaze verin; public trafik HTTPS uzerinden gelmelidir.
- Backend CORS-u yalniz real frontend domain-i ile mehdudlasdirin. CSP `connect-src` qaydasina backend API domain-i deqiq elave olunmalidir.
- PostgreSQL private network-de olsun; public port acmayin. Gunluk encrypted backup, offsite nuxse ve periodik restore testi saxlayin.
- Auth, role permission, audit append-only yazilislari ve satis-kredit-anbar-kassa transaction-lari server terefde icra olunmalidir.
- Error monitoring, uptime health check, DB alert-lari ve webhook retry queue go-live-dan once aktiv edilmelidir.

## Rollback

1. Her release image-ni immutable tag ile saxlayin: `erpaz-operations-suite:1.0.0`.
2. Deploy-den evvel DB backup ve migration geri-donus planini tesdiq edin.
3. Problem olduqda onceki image tag-ine qayidin.
4. DB migration rollback scripti olmadan production migration icra etmeyin.
