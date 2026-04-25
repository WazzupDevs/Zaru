# ADR 0016 — PII Hashing Strategy

- **Status:** Accepted
- **Date:** 2026-04-24
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

Sürücü onboarding'i iki tip kişisel veri (PII) taşıyor:

1. **TCKN** (Türkiye Cumhuriyeti Kimlik Numarası) — 11 hane, ilk haneyle birlikte
   ülke içi unique kimlik. KVKK kapsamında özel nitelikli.
2. **IBAN** — banka hesabı. Marketplace payout için zorunlu (iyzico Alt Üye İşyeri).

Plaintext olarak DB'de saklamak iki sorun yaratır:

- **KVKK ihlali** — leak durumunda doğrudan maruz kalma. Mahkeme cezası
  ve reputational damage.
- **Insider threat** — DBA / read-replica access'i olan herkes plaintext görür.

Aynı zamanda **operasyonel ihtiyaçlar farklı**:

- Admin destek ekibi "şu TCKN hangi sürücüde?" sorgusunu çalıştırmak ister
  (kimlik doğrulama, hesap kurtarma, hukuki tebligat). Bu **deterministic**
  hash gerektirir.
- IBAN için aynı sorgu **YOK**. Admin "şu IBAN kimde?" sormaz; en fazla
  "kullanıcı kendi IBAN'ı bu mu" diye doğrulama yapar (payout değişikliği
  akışında, A4+).

İki farklı use case → iki farklı strateji.

## Decision

| Veri | Algoritma   | Determinism               | Use case                                   |
| ---- | ----------- | ------------------------- | ------------------------------------------ |
| TCKN | HMAC-SHA256 | Yes (PII_HMAC_SECRET ile) | Admin lookup: equality match               |
| IBAN | argon2id    | No (her hash farklı)      | Verify only: `verifyIban(plaintext, hash)` |

### Implementation

`apps/api/src/common/security/pii-hasher.ts`:

```typescript
hashNationalId(nationalId: string): string {
  return createHmac("sha256", this.hmacSecret).update(nationalId).digest("hex");
}

async hashIban(iban: string): Promise<string> {
  return argon2.hash(iban, { type: argon2.argon2id });
}

async verifyIban(iban: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, iban);
}
```

### Display

IBAN için `last4` kolonu ayrı tutulur (`driver_profiles.iban_last4`) — UI
"…1326" gösterir, hash'in kendisi cliente sızmaz. TCKN için **display
yok** — admin paneli aramayla erişir, sürücü ekranı kendi TCKN'ini hatırlar.

### DB layout

```
driver_profiles:
  national_id_hash  TEXT NOT NULL  -- HMAC-SHA256 hex (64 chars)
  iban_hash         TEXT NOT NULL  -- argon2id encoded ($argon2id$...)
  iban_last4        TEXT NOT NULL  -- safe for display
  -- intentionally absent: national_id (plain), iban (plain)
```

Index: `driver_profiles_national_id_hash_idx` — admin lookup B-tree.
IBAN hash üzerinde index YOK (search use case yok).

### Pino redaction

Logger config'te:

```
*.nationalId, *.nationalIdHash, *.iban, *.ibanHash,
req.body.nationalId, req.body.iban
```

Hash'i bile log'a yazmıyoruz — secret rotation döneminde hash'in kendisi
"eski PII bağlantısı" olur. Defensive.

### Event payload kuralı

`supply.DriverProfileCreated` ve diğer outbox event'leri TCKN ve IBAN
plaintext + hash'i taşımaz. Sadece id'ler, isim, ibanLast4 (display için).
Subscriber'ların ham PII'ya ihtiyacı yok — varsa direkt tabloyu okusunlar
(audit'lı erişim).

### Test disiplini

`create-driver-profile.use-case.spec.ts` her happy path'te:

```typescript
const payloadJson = JSON.stringify(outbox.events[0]?.payload);
expect(payloadJson).not.toContain(VALID_TCKN);
expect(payloadJson).not.toContain(VALID_IBAN);
```

Defansif assertion — gelecekte biri payload'a PII eklerse test kırılır.

## Consequences

### İyi

- **DB leak ≠ PII leak** — saldırgan tabloyu çekse bile TCKN/IBAN plaintext
  yok. Hash crack maliyeti var (HMAC için secret zorunlu, argon2 için CPU).
- **KVKK uyumlu** — pseudonymization katmanı belge edilebilir.
- **Admin lookup hâlâ mümkün** — TCKN HMAC determinism sayesinde.

### Maliyet

- **HMAC secret rotation karmaşık** — `PII_HMAC_SECRET` değişirse tüm
  hash'ler invalidate. Migration: dual-write window (eski + yeni hash
  kolonu), gradual cutover. A4+ runbook gerekir.
- **Argon2 maliyeti** — IBAN hash + verify CPU-bound. Driver onboarding
  akışında sorun değil (rare event); high-throughput'ta ölçülür.
- **`ibanLast4` redundancy** — ayrı kolon, denormalized. IBAN değişince
  güncel tutulması şart (A4+ payout update flow).

### Riskler

- **HMAC secret leak** — `PII_HMAC_SECRET` sızarsa saldırgan offline
  brute-force ile TCKN'leri çıkarabilir (10^11 keyspace, modern GPU bunu
  saatler içinde tarar). Mitigation: secret prod'da Infisical/Doppler,
  read-only az kişi, audit log'lı erişim.
- **Argon2 parameter drift** — default parametrelerle başladık. Hash
  format'ı parametreyi içerdiği için future re-hash mümkün ama transparently
  transparently değil — explicit migration gerekir.

## Alternatives Considered

### Her ikisi argon2 (TCKN dahil)

Reddedildi: admin TCKN arama imkansız → operasyonel ekibin "bu kimliğin
hesabı hangi" sorusu cevapsız. KYC süreçlerinde kabul edilemez.

### Her ikisi deterministic HMAC (IBAN dahil)

Reddedildi: IBAN arama use case'i yok, ekstra saldırı yüzeyi.
Argon2'nin computational cost'u brute force'u ekonomik olmaktan çıkarır.
IBAN için bu daha uygun.

### AES encryption (reversible)

Reddedildi: decrypt key leak = full plaintext dump. Hash'te en azından
brute force gerekir. Reversibility ihtiyacı yok (display için `last4`
yeterli, verify için `argon2.verify`).

### Pseudonymization token vault (KMS-style)

Reddedildi: PCI-DSS düzeyinde karmaşık. KVKK için overkill, marjinal
güvenlik kazancı maliyete değmez. Revisit: ödeme verisi (kart numarası,
CVV) eklenirse — ama biz iyzico'ya delegate ediyoruz, kart hiç bizim
sistemde olmuyor.

## Revisit Trigger

- **Admin IBAN search ihtiyacı** — payout disputes / fraud invest. için
  IBAN search talep edilirse, IBAN da HMAC'a geçirilir (argon2 →
  HMAC-SHA256 migration, dual-write window).
- **Quantum-resistant hash** — SHA256 quantum güvenli sayılır (Grover's
  algoritmasıyla 128-bit eşdeğeri). Post-quantum pratiği yaygınlaşırsa
  SHA3 / BLAKE3 değerlendirilir.
- **TCKN compromise** — TCKN sayım uzayı 10^11 sabit. Hash leak +
  rainbow table generation gerçekçi. HMAC secret rotation runbook'u A4+.

## References

- Implementation: `apps/api/src/common/security/pii-hasher.ts`
- Use site: `apps/api/src/modules/supply/application/use-cases/create-driver-profile.use-case.ts`
- VOs: `apps/api/src/modules/supply/domain/value-objects/national-id.vo.ts`,
  `iban.vo.ts`
- Redaction: `apps/api/src/common/logger/logger.config.ts`
- Schema: `prisma/schema.prisma` (model DriverProfile)
- Env: `PII_HMAC_SECRET` in `apps/api/src/config/env.ts`
- KVKK referansı: `docs/adr/0003-data-conventions.md` (genel data conventions)
