# BATAK – Detaylı Oyun Kuralları ve Oyun Tipleri

> Amaç: Login gerektirmeyen, anonim oyuncularla oynanabilen ve farklı Batak türlerini tek oyun motoru üzerinden çalıştırabilen net bir oyun sistemi oluşturmak.
>
> **Not:** Batak kuralları Türkiye'de masa ve yöre alışkanlıklarına göre değişebilir. Bu doküman uygulama için **kanonik başlangıç kurallarını** tanımlar; değişebilen noktalar `RuleSet` üzerinden parametreli tutulmalıdır.

## 1. Ortak kurallar

### Deste
- Standart 52 kart.
- Joker yok.
- Renkler: Sinek (♣), Karo (♦), Kupa (♥), Maça (♠).
- Kart sıralaması: **As > Papaz > Kız > Vale > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2**.

### Oyuncu ve kart
4 kişilik oyunlarda:
- 52 kart / 4 oyuncu = **13 kart/oyuncu**.
- Bir el/trick, dört oyuncunun birer kart oynamasıdır.
- Bir dağıtımda **13 el** vardır.

## 2. Temel kavramlar
- **El:** Dört kartın oynandığı tur.
- **Koz:** Diğer renkleri yenebilen renk.
- **İhale:** Oyuncunun kaç el alabileceği konusundaki taahhüdü.
- **Batmak:** İhale/taahhüt edilen minimum el sayısına ulaşamamak.
- **Çıkılan renk:** İlk oynanan kartın rengi.
- **Renk takip:** Elinde çıkılan renkten kart varsa o renkten oynamak zorunludur.

## 3. El kazanma
1. İlk kartın rengi `leadSuit` olur.
2. Oyuncunun elinde `leadSuit` varsa o renkten oynamak zorundadır.
3. Oyuncuda `leadSuit` yoksa, varyant kuralları izin veriyorsa koz veya başka renk oynayabilir.
4. Koz oynanmışsa en yüksek koz eli kazanır.
5. Koz oynanmamışsa çıkılan renkteki en yüksek kart kazanır.
6. Eli kazanan oyuncu sonraki eli başlatır.

Örnek:
- Koz ♠
- İlk kart A♥
- Sonraki kart K♥
- Sonraki kart 2♠
- Sonraki kart 10♥
- Kazanan **2♠**.

## 4. Normal İhaleli Batak

### Genel
- Oyuncu: **4**
- Kart/oyuncu: **13**
- Toplam el: **13**
- Minimum ihale: **5**
- Maksimum ihale: **13**
- Koz: İhaleyi kazanan oyuncu seçer.
- Açık ihale: Hayır.
- Takım: Hayır.

### İhale
Geçerli teklifler:
`5, 6, 7, 8, 9, 10, 11, 12, 13`

Yeni teklif mevcut tekliften kesin olarak büyük olmalıdır.

Örnek:
```text
A: 5
B: 7
C: Pas
D: 8
A: Pas
B: Pas
C: Pas
```
Kazanan: **D / 8**.

İhaleyi kazanan oyuncu koz seçer ve önerilen varsayılan kuralda ilk eli başlatır.

### Başarı
- İhale = 7, alınan = 7 → başarılı.
- İhale = 7, alınan = 9 → başarılı.
- İhale = 7, alınan = 6 → batak.

### Varsayılan skor
- Başarılı: `+alınan_el`
- Başarısız: `-ihale`

| İhale | Alınan | Puan |
|---:|---:|---:|
| 5 | 5 | +5 |
| 5 | 7 | +7 |
| 8 | 9 | +9 |
| 8 | 7 | -8 |

## 5. Açık İhale – Bireysel

Normal ihalenin aynı temel kuralları geçerlidir; temel fark **tekliflerin bütün oyunculara açıkça gösterilmesidir**.

- Oyuncu: 4
- Kart: 13
- El: 13
- Minimum ihale: **5**
- Maksimum: 13
- Koz: İhaleyi kazanan seçer.
- Teklif geçmişi: Herkes görür.
- Takım yok.

Örnek:
```text
A: 5
B: 7
C: Pas
D: 8
A: 9
B: Pas
C: Pas
D: Pas
```
Kazanan: A / 9.

## 6. Eşli İhaleli Batak

### Takımlar
4 oyuncu iki takım oluşturur. Karşılıklı oturan oyuncular aynı takımdır.

Örnek:
```text
Takım A = Oyuncu 1 + Oyuncu 3
Takım B = Oyuncu 2 + Oyuncu 4
```

### Genel
- Oyuncu: **4**
- Takım: **2**
- Kart/oyuncu: **13**
- Toplam el: **13**
- Minimum ihale: **8**
- Maksimum ihale: **13**
- Koz: İhaleyi kazanan oyuncu seçer.
- Açık ihale: Hayır.

### En kritik kural
İhale **bireysel değil takım hedefidir**.

Örnek:
- Oyuncu D ihaleyi 10 aldı.
- D'nin partneri B.
- D = 5 el.
- B = 6 el.
- Takım toplamı = 11.
- Hedef = 10.
- Sonuç = **başarılı**.

D'nin tek başına 10 el alması gerekmez.

### Takım skoru
Varsayılan:
- Başarılı: `+takımın_aldığı_toplam_el`
- Başarısız: `-ihale`

Örnek:
- İhale 10.
- Takım 11 el aldı → **+11**.
- İhale 10, takım 8 el aldı → **-10**.
- Rakip takım aldığı el kadar puan alır.

## 7. Eşli Açık İhale

Eşli İhaleli Batak ile tüm oyun mantığı aynıdır.

Fark:
- İhale teklifleri masadaki bütün oyunculara açıkça gösterilir.
- İhale geçmişi UI'da tutulur.

### Genel
- Oyuncu: **4**
- Takım: **2**
- Kart/oyuncu: **13**
- El: **13**
- Minimum ihale: **8**
- Maksimum: **13**
- Koz: İhaleyi kazanan seçer.
- Açık teklif: **Evet**.

Örnek:
```text
A: 8
B: 9
C: Pas
D: 10
A: Pas
B: Pas
C: Pas
```
D kazanır; D + B takımının hedefi 10'dur.

## 8. Koz Maça

Bu varyantta koz sabittir:

**Koz = Maça (♠)**

### Oyun yapısı
- Oyuncu: 4
- Kart/oyuncu: 13
- El: 13
- Koz: **♠**
- Maksimum taahhüt: 13.

Koz Maça için uygulamada iki mod desteklenmelidir.

### Mod A – İhalesiz
- İhale yapılmaz.
- Koz otomatik Maça'dır.
- El kazanma mekanizması normaldir.
- Skor sistemi seçilebilir.

### Mod B – Taahhütlü
- Her oyuncu kendi alacağı el sayısını söyler.
- Minimum taahhüt: **1**.
- Maksimum: **13**.
- Amaç söylenen sayıya ulaşmaktır.

Örnek:
```text
A: 3
B: 2
C: 4
D: 2
```
A en az 3 el hedefler.

## 9. Eşli Koz Maça

İki takım vardır ve koz her zaman Maça'dır.

İki uygulama modu desteklenebilir:

### Bireysel taahhüt toplamı
Örneğin:
- A = 3
- C = 2
- Takım hedefi = 5.

Takımın toplam aldığı el 5 veya üzerindeyse başarılıdır.

### Takım doğrudan taahhüdü
Takım tek sayı söyler.
Örneğin takım hedefi 6.

Bu seçenek `teamBidMode` ile ayrılmalıdır.

## 10. Gömme / Gömmeli varyant

Bu varyant yöresel kurallara göre değiştiği için ayrı bir `RuleSet` olarak uygulanmalıdır.

Desteklenebilecek ayarlar:
- `buriedCards = 3`
- `buriedCards = 4`

Önerilen örnek akış:
1. Kartlar dağıtılır.
2. İhaleyi kazanan oyuncu gömülecek kartları alır/ortadan açar.
3. Oyuncu elinden aynı sayıda kartı kapalı olarak bırakır.
4. Koz seçer.
5. Oyun başlar.

Bu mod ilk sürümde zorunlu değildir.

## 11. Minimum ihale özeti

| Oyun türü | Minimum | Maksimum | Not |
|---|---:|---:|---|
| Normal İhale | **5** | 13 | Bireysel |
| Açık İhale | **5** | 13 | Teklifler açık |
| Eşli İhale | **8** | 13 | Takım toplamı hedef |
| Eşli Açık İhale | **8** | 13 | Takım + açık teklif |
| Koz Maça – Taahhütlü | **1** | 13 | Koz sabit Maça |
| Koz Maça – İhalesiz | - | - | İhale yok |
| Eşli Koz Maça | **1** veya takım hedefi | 13 | Mod seçilebilir |

## 12. İhale davranışı

### İlk teklif
- Normal/Open: minimum **5**.
- Team/TeamOpen: minimum **8**.

### Sonraki teklif
`newBid > currentHighestBid` olmalıdır.

Mevcut 7 ise:
- 5 → geçersiz.
- 6 → geçersiz.
- 7 → geçersiz.
- 8 → geçerli.

### Pas
Varsayılan:
- Pas veren oyuncu aynı ihale turunda tekrar teklif veremez.
- Son geçerli teklif sahibi dışında herkes pas verirse ihale biter.

## 13. İhale eşitliği
Aynı teklif tekrar edilemez.

```text
A: 7
B: 7  // GEÇERSİZ
```

B'nin en az 8 söylemesi gerekir.

## 14. Koz seçimi

Normal/Open/Team/TeamOpen modlarında:
- Kozu yalnızca ihaleyi kazanan seçebilir.
- Koz seçildikten sonra değiştirilemez.

Seçenekler:
- ♣ Sinek
- ♦ Karo
- ♥ Kupa
- ♠ Maça

Koz Maça modunda seçim yapılmaz; koz otomatik ♠.

## 15. Renk takip zorunluluğu

Örnek:
- Çıkılan renk = ♥.
- Oyuncunun elinde ♥ varsa mutlaka ♥ atmalıdır.
- ♥ yoksa koz atabilir veya başka renk oynayabilir.

Sunucu doğrulaması:
```text
leadSuit = playedCards[0].suit

if player.hasSuit(leadSuit):
    playedCard.suit == leadSuit zorunlu
```

## 16. Geçersiz hareketler
Aşağıdaki hareketler sunucu tarafından reddedilmelidir:
- Sırası olmayan oyuncunun kart oynaması.
- Oyuncunun elinde olmayan kartı oynama.
- Renk varken farklı renk oynama.
- Bitmiş elde kart oynama.
- Oyun başlamadan kart oynama.
- Yetkisiz oyuncunun ihale/koz işlemi yapması.

## 17. Oyun state'leri

```text
WaitingRoom
  ↓
Starting
  ↓
Dealing
  ↓
Bidding
  ↓
TrumpSelection
  ↓
Playing
  ↓
TrickCompleted
  ↓
NextTrick
  ↓
RoundCompleted
  ↓
ScoreCalculation
  ↓
NextRound / GameCompleted
```

## 18. Oyun bitiş seçenekleri

Oyun bitişi parametreli olmalıdır:
- Hedef puan.
- Maksimum tur.
- Sabit tur sayısı.

Önerilen ilk ayar:
- Hedef: **500**
- Alternatif maksimum: **10 tur**.
- Hedefe önce ulaşan kazanır.

## 19. Skor modları

`scoreMode` enum olarak tutulmalıdır.

### TakenMinusBidOnFail
- Başarılı: `+taken`
- Başarısız: `-bid`

### BidOnly
- Başarılı: `+bid`
- Başarısız: `-bid`

### Multiplier10
- Başarılı: `bid * 10 + overtricks`
- Başarısız: `-(bid * 10)`

Örnek:
- İhale 8, alınan 10 → 82.
- İhale 8, alınan 7 → -80.

## 20. Oda / login sistemi

Login zorunlu değildir.

Oyuncu:
- Takma ad girer.
- Sunucu anonim `playerId` üretir.
- Oda kodu ile oyuna katılır.

Örnek:
```json
{
  "playerId": "8c8df91c",
  "displayName": "Erhan",
  "anonymous": true
}
```

Önerilen istemci saklama:
```text
localStorage.batak.playerId
localStorage.batak.nickname
```

## 21. Oda ayarları

Oda oluşturulurken:
- Oyun türü.
- Minimum ihale.
- Maksimum ihale.
- Skor sistemi.
- Tur/puan sınırı.
- Açık ihale.
- Eşli oyun.
- Sabit koz.
- Gömme kartı.
- Bot.
- Reconnect süresi.

## 22. Bot

Bot seviyeleri:
- Kolay.
- Normal.
- Zor.
- Uzman.

Bot aşağıdakileri yapmalıdır:
- Kart gücünü analiz etmek.
- Muhtemel el sayısını tahmin etmek.
- Koz seçmek.
- Renk takip etmek.
- Uygun durumda koz kullanmak.
- İhale stratejisi uygulamak.

Bot gizli kart bilgisini hile olarak kullanmamalıdır.

## 23. Reconnect

Anonim sistem nedeniyle reconnect önemlidir.

Öneri:
- Bağlantı kopunca **30 saniye** bekle.
- Oyuncu aynı `playerId` ile geri gelirse masaya dönsün.
- Süre dolarsa oda ayarına göre bot devralsın veya oyun iptal olsun.

## 24. Sunucu tarafı tek gerçek kaynak

Aşağıdakiler mutlaka sunucuda hesaplanmalıdır:
- İhale.
- İhaleyi kazanan.
- Koz.
- Geçerli kart.
- El kazananı.
- Oyuncu/takımın aldığı el.
- Skor.
- Tur sonucu.

İstemci yalnızca kullanıcı aksiyonunu göndermelidir.

## 25. Oyun verisi örneği

```json
{
  "gameType": "TEAM_OPEN_BID",
  "players": 4,
  "cardsPerPlayer": 13,
  "totalTricks": 13,
  "minimumBid": 8,
  "maximumBid": 13,
  "teamMode": true,
  "openBidding": true,
  "mustFollowSuit": true,
  "bidWinnerChoosesTrump": true,
  "bidWinnerStarts": true,
  "fixedTrump": null,
  "scoreMode": "TakenMinusBidOnFail"
}
```

## 26. Önerilen RuleSet modeli

Oyun türlerini if/else ile dağıtmak yerine ortak arayüz kullanılmalıdır.

```csharp
public interface IBatakRuleSet
{
    int PlayerCount { get; }
    int CardsPerPlayer { get; }
    int TotalTricks { get; }
    int MinimumBid { get; }
    int MaximumBid { get; }

    bool IsTeamGame { get; }
    bool IsOpenBidding { get; }
    bool MustFollowSuit { get; }
    bool CanPass { get; }
    bool BidWinnerChoosesTrump { get; }
    bool BidWinnerStarts { get; }

    Suit? FixedTrump { get; }
}
```

Implementasyonlar:
```text
NormalBidRuleSet
OpenBidRuleSet
TeamBidRuleSet
TeamOpenBidRuleSet
SpadesRuleSet
TeamSpadesRuleSet
BuriedBidRuleSet
```

## 27. Variant ID'leri

```text
NORMAL_BID
OPEN_BID
TEAM_BID
TEAM_OPEN_BID
SPADES
TEAM_SPADES
BURIED_BID
```

## 28. Ana karşılaştırma tablosu

| Özellik | Normal İhale | Açık İhale | Eşli İhale | Eşli Açık İhale | Koz Maça |
|---|---:|---:|---:|---:|---:|
| Oyuncu | 4 | 4 | 4 | 4 | 4 |
| Kart/oyuncu | 13 | 13 | 13 | 13 | 13 |
| Toplam el | 13 | 13 | 13 | 13 | 13 |
| Takım | Hayır | Hayır | **Evet** | **Evet** | Opsiyonel |
| İhale | Evet | Evet | Evet | Evet | Opsiyonel |
| Minimum | **5** | **5** | **8** | **8** | **1** / yok |
| Maksimum | 13 | 13 | 13 | 13 | 13 |
| Koz | Seçilebilir | Seçilebilir | Seçilebilir | Seçilebilir | **Maça** |
| Açık teklifler | Hayır | **Evet** | Hayır | **Evet** | - |
| Renk takip | Evet | Evet | Evet | Evet | Evet |

## 29. Test senaryoları

### Normal İhale
- 5 altı teklif reddedilir.
- Mevcut tekliften küçük/eşit teklif reddedilir.
- İhale kazananı doğru belirlenir.
- Koz yalnızca kazanan tarafından seçilebilir.
- 13 el sonunda toplam el 13'tür.
- İhalenin altında kalan oyuncu batar.

### Eşli İhale
- Minimum 8.
- Takım arkadaşlarının el sayıları toplanır.
- Bireysel değil takım hedefi kontrol edilir.
- Koz ihaleyi kazanan tarafından seçilir.

### Açık İhale
- Teklifler herkese görünür.
- Teklif geçmişi sırası korunur.

### Koz Maça
- Koz daima ♠.
- ♠ diğer renkleri yener.
- Taahhüt modu 1–13 arası çalışır.

### Renk takip
- Rengi olan oyuncu başka renk atamaz.
- Rengi olmayan oyuncu koz oynayabilir.
- Koz yoksa yalnızca çıkılan renk kazanabilir.

# 30. İlk sürüm için kesin varsayılanlar

## NORMAL_BID
```text
4 oyuncu
13 kart/oyuncu
13 el
minimum ihale = 5
maksimum ihale = 13
koz = ihaleyi alan seçer
açık ihale = hayır
takım = hayır
```

## OPEN_BID
```text
4 oyuncu
13 kart/oyuncu
13 el
minimum ihale = 5
maksimum ihale = 13
koz = ihaleyi alan seçer
açık ihale = evet
takım = hayır
```

## TEAM_BID
```text
4 oyuncu
2 takım
13 kart/oyuncu
13 el
minimum ihale = 8
maksimum ihale = 13
koz = ihaleyi alan seçer
açık ihale = hayır
takım hedefi = toplam alınan el
```

## TEAM_OPEN_BID
```text
4 oyuncu
2 takım
13 kart/oyuncu
13 el
minimum ihale = 8
maksimum ihale = 13
koz = ihaleyi alan seçer
açık ihale = evet
takım hedefi = toplam alınan el
```

## SPADES
```text
4 oyuncu
13 kart/oyuncu
13 el
koz = maça
taahhüt = opsiyonel
minimum taahhüt = 1
maksimum = 13
```

# 31. Kritik uygulama kararı

Oyunun bütün kuralları tek bir yere dağılmamalıdır. Oyun motoru ortak olmalı, farklılıklar `RuleSet` tarafından belirlenmelidir.

Özellikle şu değerler konfigüre edilebilir olmalıdır:
- `minimumBid`
- `maximumBid`
- `teamMode`
- `openBidding`
- `fixedTrump`
- `buriedCards`
- `scoreMode`
- `targetScore`
- `maxRounds`
- `bidWinnerStarts`
- `bidWinnerChoosesTrump`
- `reconnectSeconds`
- `botTakeoverSeconds`

Bu yapı sayesinde daha sonra yöresel/özel Batak kuralları eklenirken oyun motorunun çekirdeği değiştirilmez.
