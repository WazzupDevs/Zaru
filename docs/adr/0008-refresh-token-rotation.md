# ADR 0008 — Refresh Token Rotation Strategy

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

Faz 1 auth akışı: OTP doğrulanınca kullanıcıya iki token verilir.

- **Access token** — JWT, 15 dakika TTL. Her API çağrısında `Authorization`
  header'ında. Stateless: imzasıyla doğrulanır, sunucu state'i tutmaz.
- **Refresh token** — uzun ömürlü (30 gün), client-side persistent storage'da
  (mobil keychain). Süresi dolan access token'ı yenilemek için kullanılır.

Refresh token "uzun" olduğu için, client cihazı ele geçirilirse veya token
log/proxy/hata mesajıyla sızarsa, saldırgan **30 gün boyunca yeni access
token alabilir**. Bu süre içinde meşru kullanıcının "ben hacklendim" deyip
oturumu sonlandırması mümkün ama gerçekçi değil — kullanıcı çoğunlukla farkında
bile değildir.

Kabul edilemez. Refresh token'ı **rotate** etmek + **reuse'u algılamak** şart.

## Decision

### Rotation + reuse detection + token family

1. **Her refresh çağrısında rotation:** İstemci `POST /auth/tokens/refresh`
   gönderir. Sunucu eski refresh'i `revokedAt = now` işaretler, yeni bir refresh
   üretir, yeni token'ın `replacedById` alanını eski token'ın id'sine yazar.
   Aynı `familyId`'yi taşır (chain devam eder).

2. **Token family:** Bir login session'ı boyunca rotation chain'i tek bir
   `familyId` (UUID) altında toplanır. İlk OTP verify'da yeni `familyId`
   üretilir; sonraki tüm rotation'lar aynı id'yi taşır. Yeni login → yeni
   family.

3. **Reuse detection:** Eğer biri **`revokedAt IS NOT NULL`** olan bir refresh
   token'la refresh çağrısı yaparsa:
   - O `familyId`'ye ait **tüm** token'lar revoke edilir (`UPDATE refresh_tokens
SET revoked_at = now WHERE family_id = $1 AND revoked_at IS NULL`).
   - Domain event `RefreshReuseDetected` outbox'a yazılır (security audit).
   - İstemciye `401 REFRESH_REUSE_DETECTED` döner — uygulama kullanıcıyı login
     ekranına yönlendirir.

   **Mantık:** Saldırgan eski (revoke edilmiş) bir token'ı klonlayıp kullanmışsa,
   meşru kullanıcı bir sonraki yenilemede yakalanır — biri zaten o token'ı kullanmış.
   İki taraf da aynı chain'de yarışıyor; chain kırılınca her ikisi de session'ı
   kaybeder. Saldırgan da, kullanıcı da yeniden login (OTP) yapmak zorundadır.
   Bu, MITRE'nin "Refresh Token Reuse Detection" pattern'idir.

4. **Logout = refresh revoke.** Access token kısa ömürlü olduğu için DB'de
   tutmuyoruz, runtime'da revoke da edemiyoruz. Logout endpoint'i sadece
   refresh token'ın `revokedAt`'ini set eder — sonraki refresh denemesi başarısız
   olur (15 dakika içinde access da ölür). "Tüm cihazlardan çıkış" =
   `revokeByUserId` (aile bazında değil, kullanıcının tüm aktif token'ları).

### Token formatı ve depolama

- **Access token:** JWT (HS256). Payload: `sub` (userId), `role`, `iat`, `exp`,
  `requestId` (audit). Secret: `JWT_ACCESS_SECRET` (env, ≥64 hex char).
  **DB'de tutulmaz.** Stateless.

- **Refresh token:** 32-byte cryptographically-random string,
  `crypto.randomBytes(32).toString('base64url')`. Plaintext sadece istemciye
  döner. **DB'de SHA-256 hash olarak tutulur** (`token_hash` UNIQUE).

  **Neden argon2 değil:** Argon2 password hashing içindir — düşük entropi'li
  girdileri brute force'a karşı yavaşlatır. Refresh token zaten 256-bit random,
  brute force matematiksel olarak imkânsız. SHA-256 sabit-zaman karşılaştırma
  için yeter (`crypto.timingSafeEqual`). Argon2'nin CPU maliyeti (login
  başına ~100ms) gereksiz.

  **OTP kodu** ise 6 haneli sayısal (~20 bit entropy) — düşük. OTP için argon2id
  (mevcut). Bu iki use case ayrı.

### Algoritma seçimi: HS256

Access token JWT için **HS256** (HMAC-SHA256). Asimetrik (RS256/ES256) yerine
simetrik:

- Tek sunucu cluster'ı tüm token'ları üretir + verify eder. Public key
  dağıtımı senaryosu yok (mobile client verify yapmaz).
- HS256 daha hızlı (~10x).
- Secret rotation için `JWT_ACCESS_SECRET` env değişkeni → blue/green deploy ile.

A4'te eğer mobile client sertifika pinning + offline JWT verify yapacaksa
ES256'ya geçilir (private key sunucuda, public key client'a embed edilir).

## Consequences

### İyi

- Sızan refresh token için saldırı penceresi 30 gün → ortalama dakikalar
  (meşru kullanıcı bir sonraki refresh'te yakalar).
- Audit trail: tüm rotation chain `replacedById` ile geri sürülebilir.
- Stateless access token → token verify her request'te DB hit gerektirmez.

### Maliyet

- Her refresh çağrısı: 1 SELECT (`findUnique` by hash) + 2 UPDATE/INSERT (eski
  revoke + yeni insert). Aynı transaction'da. ~5ms.
- Reuse detection durumunda 1 ek `UPDATE WHERE family_id = $1`. Family başına
  ortalama 5-10 token (30 gün × 1 rotation/saat hesabıyla yüksek tahmin) →
  pratikte ihmal edilebilir.

### Riskler

- **Race condition:** İki paralel refresh request aynı eski token'la gelirse
  (mobile uygulama bağlantı kopukluğu retry'ı), ikisi de "geçerli" görüp
  ikisi de yeni token verir → kısa süre 2 aktif token. PostgreSQL
  `SERIALIZABLE` transaction veya `SELECT ... FOR UPDATE` ile çözülür.
  **A2c MVP'de:** `findUnique` + `update` aynı `$transaction` içinde —
  Prisma default `READ COMMITTED`, race penceresi var ama küçük; reuse detection
  yine yakalar (ikinci request "zaten revoke edilmiş" der → family revoke).
  A4'te `FOR UPDATE` veya `version` kolonu eklenebilir.

- **Token sızıntısı log'da:** Refresh token plaintext'i hiçbir log'a yazılmamalı.
  nestjs-pino redaction listesinde `tokenHash` ve `Authorization` zaten var;
  istek body'sindeki `refreshToken` alanı da redact edilmeli (request-otp pattern'i).
  Test: redaction spec'e ek case.

## Alternatives Considered

### Sliding session (her isteğe TTL uzat)

Her API çağrısında refresh'in `expiresAt`'ini `now + 30d` yap. Avantaj: Aktif
kullanıcılar logout olmaz. Dezavantaj:

- Her API çağrısı 1 ek DB write (refresh revoke + new insert). Read-heavy
  workload write-heavy oluyor.
- "Hemen logout" zor — sliding sayesinde dolu hızlı uzar.
- Stateless prensibe (access token her şeyi taşır) ters.

**Red.**

### Opaque token + Redis storage

Refresh + access ikisi de DB/Redis'te tutulan random string. Verify her request'te
1 Redis hit. Avantaj: revoke instant. Dezavantaj:

- Her istek için Redis round-trip (mobile'de latency hassasiyeti).
- JWT'nin self-contained avantajı (debug, log, distributed verify) yok.
- Mevcut altyapı için over-engineering.

A4 sonrası ölçek tartışmasında değerlendirme — **şimdi red.**

### Rotation'sız uzun ömürlü refresh

En basit. Refresh ömürlü 30 gün, hiç değişmiyor, çalınma → 30 gün saldırı.
**Açıkça red.**

### Rotation + family yok (sadece eski token revoke)

Reuse detection çalışmaz çünkü hangi token chain'in parçası bilinmez. Saldırgan
çalınan bir token'ı sessizce kullanırsa fark edilmez. **Red.**

## References

- [OAuth 2.0 Best Current Practice — Refresh Token Rotation](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics-23#section-4.13)
- [Auth0 — Refresh Token Rotation with Automatic Reuse Detection](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
