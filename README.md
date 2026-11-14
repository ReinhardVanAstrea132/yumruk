# 🥊 YUMRUK! — Arkadaşınla Sıra Tabanlı Boks

İnternet üzerinden arkadaşınla oynayabileceğin **ücretsiz, kurulumsuz** sıra tabanlı boks oyunu. Sunucu gerekmez — doğrudan tarayıcıdan tarayıcıya (P2P).

## 🎮 Nasıl Oynanır

| Tuş | Aksiyon |
|-----|---------|
| **E** | Gerçek yumruk at |
| **Q** | Fake (sahte) at |
| **SPACE** | Dodge (kaçın) |

- **Sıra sende:** Rakip savunurken `E` ile vur ya da `Q` ile kandır.
- **Sıra rakipte:** Hamle geliştirdiği anda `SPACE` ile doğru anda kaçın (yeşil pencerede kaçın).
- **Fake taktiği:** Fake'e kapılan rakip bir sonraki turda **dengesiz olur, kaçamaz!**
- **Kontra:** Temiz dodge yaparsan bir sonraki vuruşun +8 hasar vurur.
- **Kombo:** Üst üste isabet ettirdikçe vuruşların güçlenir (×2, ×3...).
- **5 saniye** içinde karar vermezsen rakip bedava jab atar.

## 👥 Arkadaşınla Oynama

1. Oyunu aç → ismini yaz → **ODA KUR**
2. **KODU KOPYALA** veya **DAVET LİNKİNİ KOPYALA**
3. Arkadaşın linki açsın (veya koda girsin) → **ODA KATIL**
4. Sen **MAÇA BAŞLA**'ya bas → Maç başlar!

> İpucu: Aynı bilgisayarda test etmek için ikinci bir pencere (gizli sekme) aç.

## 🌍 GitHub Pages'e Yayınlama

1. GitHub'da **new repository** oluştur (örn. `yumruk`)
2. Bu klasördeki dosyaları repo'ya yükle (`index.html`, `style.css`, `game.js`, `README.md`)
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → **Save**
4. Birkaç dakika sonra oyun `https://KULLANICIADIN.github.io/yumruk/` adresinde yayında
5. Bu adresi arkadaşınla paylaş — kod gerekmeden link üzerinden de katılabilir

## 🛠 Teknik

- **trystero** (v0.27.0) — Nostr genel röleleri üzerinden sunucusuz P2P WebRTC bağlantısı
- Saf HTML/CSS/JS — framework yok, build yok, bağımlılık yok (CDN: esm.sh + Google Fonts)
- Sunucu, veritabanı, API anahtarı **gerektirmez**

## 📁 Dosyalar

```
index.html   — Ekranlar (menü, lobi, maç, sonuç)
style.css    — Ring, dövüşçüler (saf CSS), HUD, animasyonlar
game.js      — Oyun mantığı + ağ (trystero)
```
