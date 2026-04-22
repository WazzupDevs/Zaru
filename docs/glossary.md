# Glossary — Event Fleet Platform

Ubiquitous language. Bu dosyadaki terim adları **kod, API, dokümantasyon ve sohbet
mesajlarında birebir** kullanılır. Yeni terim girerse önce buraya yaz, sonra kullan.

---

## Catalog Terimleri

### ServiceCategory

Platformun arz ettiği üst seviye hizmet kategorisi. Örnek: "Düğün Aracı",
"Oto Kurtarıcı", "Vale", "Kurumsal Servis". Polimorfik domain modelinin **kök** ayrımı —
yeni vertical bu seviyede tanımlanır.

### CategoryAttributeDefinition

Bir kategoriye özgü dynamic attribute şemasının kayıt türü. Düğün için "tavan tipi",
"koltuk sayısı", "dış süs uygunluğu" gibi alanları konfigürasyon olarak (JSONB) tanımlar.
Yeni vertical eklerken kod değişikliği gerektirmemesinin temel kaldıracı.

### VehicleType

Sürücünün sahip olduğu fiziksel araç tipinin sınıflandırılması (sedan, minibüs, otobüs vb).
ServiceCategory ile çoğa-çok ilişkili — bir araç tipi birden çok kategori için uygun
olabilir.

---

## Supply (Arz) Terimleri

### DriverProfile

Bir kullanıcının (User, role=DRIVER) sürücü olarak çalıştığı profil verisi. Onboarding
state machine ile yönetilir: PENDING → DOCS_REQUIRED → REVIEW → APPROVED / REJECTED.
Onaylanmadan dispatch'e dahil edilmez.

### Vehicle

Bir DriverProfile'a bağlı fiziksel araç kaydı. VehicleType ile tipi belirlenir, kategori
attribute'ları doldurulur. Bir sürücü birden çok aracı olabilir.

### VehicleAvailability

Bir Vehicle için zaman dilimi bazlı uygunluk takvimi. Sürücü "şu tarihte müsait/değil"
işaretler; dispatch motoru bu takvimden okur.

---

## Pricing (Fiyat) Terimleri

### PricingRule

Tek bir fiyat parametresi (örn. base_per_km, season_multiplier, weekend_surcharge).
PricingStrategy bu rule'ları kombine ederek nihai fiyatı üretir. Veritabanında saklanır,
admin paneli üzerinden yönetilir.

### PricingStrategy

ServiceCategory başına seçilen, PricingRule'ları nasıl birleştireceğini tarif eden
algoritma (Strategy pattern). Örnek: `DistanceTimeStrategy`, `FlatRateStrategy`.
Strategy seçimi config'tendir, kod değişikliği yapılmaz.

### Quote

Sunucuda hesaplanan, **imzalı ve TTL'li** fiyat teklifi. Müşteriye gösterilen fiyat tek
otorite kaynağıdır — client asla fiyat hesaplamaz. TTL dolduktan sonra Booking'e
çevrilemez.

---

## Booking (Rezervasyon) Terimleri

### Booking

Müşteri ile sürücü arasındaki fiilen yapılmış rezervasyon kaydı. Optimistic locking
(`version` kolonu) ile concurrency korunur; idempotency-key ile tekrar oluşturma
engellenir; audit log JSON diff olarak tutulur.

### BookingFlow

Booking'in durumlarını (DRAFT, QUOTED, CONFIRMED, DISPATCHED, IN_PROGRESS, COMPLETED,
CANCELLED) ve geçişlerini tanımlayan XState makinesi. State'ler ve transition guard'lar
config'ten gelir, kategoriye göre değişebilir.

---

## Dispatch (Atama) Terimleri

### Dispatch

Bir Booking'in uygun sürücülere teklif edilmesi sürecini yöneten domain konsepti. Eşleşme
algoritması (mesafe, rating, availability, kategori uygunluğu) burada çalışır.

### Assignment

Bir Booking için belirli bir sürücüye yapılan teklif kaydı. Sürücü kabul eder, reddeder
veya zaman aşımına uğrar. Bir Booking için birden çok Assignment denenebilir
(reassignment).

---

## Payment (Ödeme) Terimleri

### Payment

Bir Booking'e karşılık iyzico üzerinden yürütülen ödeme akışı. Auth (provizyon),
capture (tahsilat), refund (iade) state'lerini ve iyzico transaction id'lerini tutar.
Optimistic locking + idempotency key zorunlu.

### Wallet

Bir DriverProfile'ın platform içi bakiye kaydı. Capture sonrası komisyon düşülerek
sürücü Wallet'ına işlenir; sürücü Payout talep ettiğinde Wallet'tan banka hesabına
geçer.

### Payout

Sürücünün Wallet bakiyesinden banka hesabına yapılan transfer kaydı. iyzico
Marketplace'in payout API'si üzerinden tetiklenir; webhook ile sonuç doğrulanır.

---

## Reviews / Reputation

### Review

Tamamlanmış bir Booking sonrası müşterinin sürücüye veya sürücünün müşteriye verdiği
puan + opsiyonel yorum. Moderation kuyruğundan geçer (PII / hakaret filtresi).

---

## Cross-Cutting (Yatay) Konseptler

### OutboxEvent

Domain event'leri kayıpsız iletmek için kullanılan transactional outbox tablosu kaydı.
Aggregate'in değişikliğiyle aynı DB transaction'ında yazılır; ayrı bir worker okur,
publish eder, başarılı olunca `processed_at` set eder.

### Idempotency-Key

Mutating endpoint'lere client tarafından gönderilen başlık. Aynı key ile gelen tekrarlı
istekler ilk yanıtı döndürür; yeni iş yapılmaz. Redis'te 24 saat + Postgres'te kalıcı
saklanır.

### Domain Event

Bir aggregate'in iş açısından anlamlı durum değişikliği (örn. `BookingCreated`,
`PaymentAuthorized`). Geçmiş zaman fiil ile adlandırılır; payload immutable. Modüller
arası iletişim **sadece** event üzerinden yapılır.

### Audit Log

User, Booking, Payment ve Wallet üzerinde yapılan değişikliklerin kim/ne zaman/ne JSON
diff'i olarak kaydedildiği hat. Compliance ve dispute'lar için load-bearing.

### Soft Delete

Kayıtların `deleted_at` kolonuyla mantıksal silinmesi. Tüm sorgular default `deleted_at
IS NULL` filtresinden geçer (Prisma extension ile A2'de). Hard delete sadece KVKK DSAR
gibi compliance senaryolarında.

### Tenant

Çoklu kiracılık için ayrılan boundary. Şu an tek tenant ile çalışıyoruz; `tenant_id`
kolonu modellerde **hazır** ama mantık katmanı ileride.

---

## Domain Doğrulama Kuralları

### Phone Format (`phone_e164`)

**TR mobile only**: `^\+90(5)\d{9}$` — sadece Türkiye GSM (5xx) hatları kabul. Yurt dışı
veya sabit hat reddedilir. Gerekçe: SMS pumping fraud (premium-rate yurt dışı numaralara
OTP yağdırma) saldırı vektörünü kapatmak. B2B/yurt dışı ihtiyacı çıkarsa generic
E.164'e (`^\+[1-9]\d{7,14}$`) gevşetilir; o noktada rate-limit + CAPTCHA + ülke
whitelist katmanları zorunlu olur. Detay: [ADR 0003](./adr/0003-data-conventions.md).
