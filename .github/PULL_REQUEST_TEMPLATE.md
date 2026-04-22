<!-- Lütfen aşağıdaki başlıkları doldurarak PR açın. Boş bırakılan başlıklar review'da geri döner. -->

## Ne?

<!-- Bu PR ne yapıyor? 1-3 cümle özet. -->

## Niye?

<!-- Motivasyon: hangi sorunu çözüyor, hangi issue/karar bağlıyor? Link verin. -->

## Nasıl test edildi?

<!-- Hangi test türleri ile doğrulandı? -->

- [ ] Unit (Vitest)
- [ ] Integration (Testcontainers — gerçek Postgres/Redis)
- [ ] E2E (Detox / Playwright)
- [ ] Manuel (adımları aşağıya yazın)

<!-- Manuel test adımları (varsa): -->

## Breaking change?

<!-- Evet ise: neyin kırıldığı, migration adımları, geri alma planı. Hayır ise: "Hayır." -->

## Dashboard / metric etkisi?

<!-- Yeni domain event, metric, alert, log alanı, Grafana panel değişikliği var mı?
     Hangi observability artefaktlarının güncellenmesi gerek? Yoksa "Yok." -->

## Checklist

- [ ] Test yazıldı (kritik path için **test-first**)
- [ ] Dokümantasyon güncellendi (CLAUDE.md / modül CLAUDE.md / README)
- [ ] Mimari karar gerektirmedi (gerektirdi → `docs/adr/NNNN-*.md` eklendi)
- [ ] `docs/progress.md` güncel
- [ ] CLAUDE.md kurallarına uyumlu (idempotency, optimistic lock, audit, outbox, secret yok)
