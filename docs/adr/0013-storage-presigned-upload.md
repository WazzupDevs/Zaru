# ADR 0013 — Storage: S3-Compatible with Presigned PUT

- **Status:** Accepted
- **Date:** 2026-04-24
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

A3b'de sürücü onboarding'i geliyor. Onboarding üç tip dosya gerektiriyor:

1. **Evrak** (ehliyet, ruhsat, sigorta, kasko, yetki belgesi, kimlik) — PDF veya görsel.
2. **Araç fotoğrafı** — birden fazla görsel.
3. **(İleride)** Müşteri kullanıcı avatar'ı, mesajlaşmadaki görseller.

Backend'in dosyayı kendi üzerinden geçirmesi (proxy upload) üç maliyet yaratır:
memory pressure (multer buffer), bandwidth (gereksiz network), ve timeout
(yavaş 3G kullanıcısı 15 MB upload'ı 30+ saniyede yapıyor — Node event loop
boyunca tutulur).

Aynı zamanda dev ortamı ile prod'un aynı kod yolunu paylaşması şart. Farklı
adapter (dev MinIO için, prod R2 için) yazmak DRY ihlali ve dev-prod parity
testini imkansız kılar.

## Decision

**S3-compatible object storage**, dev'de MinIO, prod'da Cloudflare R2.
Yükleme **presigned PUT URL** ile client tarafından doğrudan storage'a;
backend yalnızca key + metadata tutar.

```
apps/api/src/common/storage/
  storage.port.ts          — interface + Symbol token
  s3-storage.ts            — production impl (@aws-sdk/client-s3)
  storage-key-builder.ts   — canonical key layout
  storage.module.ts        — @Global, default useExisting: S3Storage
infra/docker/docker-compose.dev.yml
  minio:                   — dev S3 endpoint (port 9000), console (port 9001)
  minio-init:              — one-shot mc bucket bootstrap + anonymous read
```

### Presigned PUT — Content-Length signing

```typescript
const command = new PutObjectCommand({
  Bucket: this.bucket,
  Key: input.key,
  ContentType: input.contentType,
  ContentLength: input.maxSizeBytes, // signed
});
const uploadUrl = await getSignedUrl(this.client, command, {
  expiresIn: input.expiresInSeconds,
});
```

`ContentLength` URL'in imzasına dahil — **client bypass edilemez**. 16 MB
dosyayı 15 MB limit ile yüklemeye kalkarsa S3 400 ile reddeder. Bu Hard
limit, "client'a güvenelim" değil "imza zorla" kuralı.

### Bucket layout

`StorageKeyBuilder` canonical:

```
drivers/<driverProfileId>/documents/<documentId>.pdf
drivers/<driverProfileId>/vehicles/<vehicleId>/photos/<photoId>.jpg
```

Tek prefix altında her sürücü = "delete everything for driver X" tek
prefix-delete. KVKK silme talebi geldiğinde `aws s3 rm --recursive
s3://bucket/drivers/<id>/`.

### Health check

`/readyz` endpoint'inde `HeadBucket` çağrısı, 2 saniye timeout. Storage
down'sa pod ready vermez ama liveness etkilemez (process up'ta kalır,
storage gelince ready olur — restart loop riski yok).

### Allowed mime types (whitelist)

```
application/pdf, image/jpeg, image/png
```

HEIC, HEIF, video, vs şu an YOK. Genişleme: virus scan + EXIF strip + thumbnail
pipeline gelince (A4+).

### Max file size

15 MB hard cap. Onaylandı (kullanıcı). Düşük internet hızlarında pratik tavan;
PDF taranmış evrak için yeterli, mobil çekim fotoğraf için fazlasıyla.
Genişleme: video upload (50 MB+) ihtiyacı doğarsa chunked / multipart upload.

## Consequences

### İyi

- **Backend bandwidth + memory'i tasarruflu** — 100 driver × 6 evrak × 3 MB =
  1.8 GB upload trafiği API'den geçmez.
- **Dev-prod parity** — aynı SDK, aynı çağrılar; sadece endpoint + credentials
  farklı.
- **Test edilebilir** — Testcontainers MinIO ile gerçek round-trip
  (`storage.integration-spec.ts`).
- **Soft delete + KVKK** — driver-level prefix delete tek komut.

### Maliyet

- **Post-upload pipeline yok** — virus scan, EXIF strip, thumbnail A4+. Şu
  anda sürücü malicious PDF yüklerse backend görmüyor (sadece S3 görüyor).
  Risk kabul: admin onay aşaması manual review (a3c approval workflow), sonra
  worker pipeline gelecek (A4).
- **MinIO prod-grade değil** — dev için. Prod R2'ye çıkacak. Image RELEASE
  tag'iyle pinli (CI determinism).
- **Public read URL** — dev'de bucket policy anonymous download. Sürücü
  evrak'ı browsable. Prod'da R2 + signed download URL'leri (15dk TTL) +
  audit log gelecek (A4).

### Riskler

- **Endpoint URL leak** — STORAGE_PUBLIC_URL env'inden compose ediliyor; dev'de
  localhost, prod'da R2 CDN. Yanlış env = yanlış URL döner. Mitigation: smoke
  test deploy sonrası (A4 deploy script).
- **HMAC signing CPU** — presigned URL üretimi her request'te. Önemsiz (mikro-saniye)
  ama yüksek QPS'te ölçülür.

## Alternatives Considered

### Backend proxy upload (multer)

Reddedildi: bandwidth, memory, timeout. Yukarıda detay.

### TUS (resumable upload protocol)

Reddedildi: aşırı karmaşık şu an. Mobil 3G'de 15 MB upload kesilirse retry
sürücüden — kabul edilebilir. TUS gelince A4+ değerlendirme (video upload
gerekirse).

### Direct multipart to API + stream to S3

Reddedildi: backend hâlâ I/O paths'te. Avantaj yok presigned'a göre, sadece
"client'a S3 endpoint'i dökülmüyor" güvenlik teorisi — ki S3 endpoint'i zaten
public bilgi.

### CloudFront / R2 Custom Domain

A4'te (prod). Şu anda doğrudan R2 hostname yeterli; dev'de localhost MinIO.

## Revisit Trigger

- **Video upload ihtiyacı** (50 MB+) → multipart / chunked upload eklenir.
- **Virus / malware case** → ClamAV worker pipeline (post-upload event'le tetiklenir).
- **EU residency requirement** → R2 region pin (Cloudflare bunu zaten sağlıyor;
  config değişikliği).
- **CDN cache headers / immutable URLs** → asset versioning + Cache-Control eklenir.

## References

- Implementation: `apps/api/src/common/storage/`
- Test: `apps/api/test/storage.integration-spec.ts`
- Dev compose: `infra/docker/docker-compose.dev.yml` (minio, minio-init)
- Health check: `apps/api/src/common/health/storage.health-indicator.ts`
- Env schema: `apps/api/src/config/env.ts` (STORAGE\_\*)
