# Batak Oyunu – Kural, Oyun Tipleri ve Teknik Spesifikasyon

## 1. Dokümanın Amacı

Bu doküman, Türk iskambil oyunu **Batak** için web, masaüstü veya mobil ortamda geliştirilebilecek bir oyun motorunun kapsamını tanımlar.

Amaç:

- Kullanıcıların **login olmadan** oyuna girebilmesi
- Oyuncuların geçici/anlık kullanıcı adı ile tanımlanması
- Farklı Batak türlerinin aynı oyun motoru üzerinde çalışması
- İnsan oyuncu ve bilgisayar oyuncusu (bot) desteği
- Oyun kurallarının konfigüre edilebilir olması
- El, tur, skor ve oyun geçmişinin doğru tutulması
- Oyun kurallarının varyanta göre kesin biçimde uygulanması

> Not: Batak kuralları Türkiye'de yöreye, arkadaş grubuna ve uygulamaya göre değişebilir. Bu doküman "çekirdek Batak" kurallarını ve yaygın varyantları tanımlar. Oyun ekranında seçilen varyant, ilgili kural setini belirlemelidir.

---

# 2. Genel Oyun Tanımı

Batak, standart 52 kartlık deste ile oynanan, çoğunlukla 4 kişiyle oynanan, el alma (trick-taking) mantığına dayalı bir iskambil oyunudur.

Temel kavramlar:

- **Deste:** 52 kart
- **Oyuncu:** Genellikle 4
- **El/Trick:** Masaya sırayla atılan kartlardan oluşan mini mücadele
- **Tur:** Bir oyuncunun dağıtıcı olduğu ve tüm kartların oynandığı bölüm
- **Koz:** O elde diğer renklerden üstün olan renk
- **İhale:** Oyuncuların alabileceklerini düşündükleri el sayısını ilan etmesi
- **Batmak:** Oyuncunun taahhüt ettiği eli alamaması
- **El almak:** Trick'i kazanmak
- **Dağıtıcı:** Kartları dağıtan oyuncu

Kart sıralaması yüksekten düşüğe:

**A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2**

Koz olarak belirlenen renkteki kartlar, diğer tüm renklerden üstündür.

---

# 3. Deste ve Oyuncu Sistemi

## 3.1 Kartlar

Dört renk:

- ♠ Maça
- ♥ Kupa
- ♦ Karo
- ♣ Sinek

Her renkte 13 kart bulunur:

```text
A K Q J 10 9 8 7 6 5 4 3 2
```

Toplam:

```text
4 x 13 = 52 kart
```

## 3.2 Oyuncu Sayısı

Desteklenmesi önerilen oyuncu sayıları:

- 2 oyuncu – özel/opsiyonel
- 3 oyuncu – 3'lü varyantlar
- 4 oyuncu – standart Batak
- 5+ oyuncu – yalnızca özel kurallar ile

Ana oyun motoru **4 oyuncuya optimize edilmelidir**.

---

# 4. Login Olmadan Kullanıcı Sistemi

Oyunda hesap sistemi zorunlu olmayacaktır.

Oyuncu oyuna girdiğinde:

```text
Oyuncu Adı: Erhan
```

gibi bir takma ad belirler.

Sunucu tarafında geçici kimlik:

```text
PlayerId = UUID
DisplayName = "Erhan"
```

şeklinde tutulabilir.

## 4.1 Kimlik Kuralları

- Login zorunlu değildir.
- E-posta istenmez.
- Şifre istenmez.
- Kullanıcı adı benzersiz olmak zorunda değildir; aynı isim varsa görsel ayırt edici numara eklenebilir.
- Tarayıcı yenilendiğinde oyuncunun oturumuna devam edilmesi istenirse LocalStorage/SessionStorage kullanılabilir.
- Kalıcı hesap bulunmadığından istatistiklerin güvenilirliği garanti edilmez.

Örnek:

```text
PlayerId: 9c0f...
DisplayName: Erhan
Avatar: random-07
ConnectionId: websocket-id
```

---

# 5. Ana Oyun Modları

Uygulamada aşağıdaki modların desteklenmesi önerilir.

## 5.1 İhaleli Batak

Oyuncular sırayla kaç el alabileceklerini söyler.

Örnek:

```text
Minimum ihale: 5
Oyuncu A: 5
Oyuncu B: 6
Oyuncu C: Pas
Oyuncu D: 7
```

En yüksek ihaleyi veren oyuncu:

- Kozu belirler.
- Belirlediği sayıyı almak zorundadır.

## 5.2 Koz Maça

Koz sabit olarak **Maça ♠** kabul edilir.

İhale yapılmayabilir veya kullanılan uygulamanın kural setine göre yapılabilir.

Bu varyant özellikle kolay öğrenilen mod olarak sunulabilir.

## 5.3 Eşli İhaleli Batak

4 oyuncu iki takımdır:

```text
Takım A: Oyuncu 1 + Oyuncu 3
Takım B: Oyuncu 2 + Oyuncu 4
```

Takım arkadaşları karşılıklı oturur.

İhale bireysel yapılabilir; fakat alınan eller takım toplamına yazılır.

## 5.4 Gömmeli Batak

Kart dağıtımından sonra belirli kartlar oyuncunun elinden/ortak kartlardan ayrılır.

İhaleyi kazanan oyuncu belirli sayıda kartı görebilir/değiştirebilir.

Bu modun tam davranışı ayrıca varyant ayarı olarak tutulmalıdır çünkü yöresel kurallar farklıdır.

## 5.5 3-5-8 / 3-5-8 Batak

3 oyunculu yaygın bir trick-taking varyantıdır.

Oyuncuların hedefleri toplamda:

```text
3 + 5 + 8 = 16 el
```

olarak belirlenebilir.

Dağıtım ve kart değiştirme kuralları varyanta göre değişebildiğinden bu mod bağımsız bir kural motoru olarak tasarlanmalıdır.

## 5.6 Kozlu / İhalesiz Batak

Koz oyun başlamadan önce sabit veya açık bir kuralla belirlenir.

Oyuncular ihale vermez.

Amaç mümkün olduğunca fazla el almaktır.

## 5.7 Eşli Koz Maça

4 oyunculu takım modu.

- Takım bazlı skor
- Koz: Maça
- İhale opsiyonel
- Oyuncu eşleri sabittir

---

# 6. İhale Sistemi

İhaleli Batak için temel akış:

```text
Kartlar dağıtılır
        ↓
İhale başlar
        ↓
Oyuncular sırayla teklif verir
        ↓
En yüksek teklif sahibi belirlenir
        ↓
Koz seçilir
        ↓
Kartlar oynanır
        ↓
Alınan eller hesaplanır
        ↓
Skor yazılır
```

## 6.1 İhale Sırası

Saat yönünde ilerleyebilir.

Örneğin:

```text
Dağıtıcı: Player1
İlk ihale: Player2
Sonraki: Player3
Sonraki: Player4
Sonraki: Player1
```

## 6.2 İhale Değerleri

Varsayılan:

```text
Minimum: 5
Maksimum: 13
```

Konfigürasyon:

```json
{
  "minimumBid": 5,
  "maximumBid": 13,
  "allowPass": true
}
```

## 6.3 Aynı İhale

Çoğu standart uygulamada aynı teklif tekrar verilemez; sıra ve mevcut en yüksek teklif dikkate alınır.

Örnek:

```text
A: 5
B: 5  -> Geçersiz
B: 6  -> Geçerli
```

Fakat bazı ev kurallarında eşit teklif kabul edilebilir. Bu nedenle:

```text
AllowEqualBid = false
```

şeklinde ayarlanabilir.

## 6.4 Herkes Pas Geçerse

Kurala göre iki yaklaşım desteklenebilir:

### Kural A

Dağıtıcı otomatik olarak minimum ihaleyi alır.

### Kural B

Tur yeniden dağıtılır.

Varsayılan uygulama:

```text
allPassAction = DealerTakesMinimum
```

---

# 7. Koz Belirleme

İhaleyi kazanan oyuncu koz seçer.

Geçerli kozlar:

```text
♠ Maça
♥ Kupa
♦ Karo
♣ Sinek
```

Örneğin:

```text
İhale: 8
Koz: Kupa
```

Bu durumda herhangi bir kupa kartı, oynanan ana renkten güçlü olabilir.

---

# 8. Koz Seçme Kuralları

Konfigürasyon ile aşağıdaki seçenekler desteklenebilir:

```text
AllowTrumpSelection = true
TrumpMode = PlayerSelect
```

Alternatifler:

```text
FixedSpades
RandomTrump
PlayerSelect
FirstCardTrump
```

---

# 9. Kart Atma ve Renk Takibi

Batak'ın en önemli kurallarından biri **renge uymaktır**.

Örneğin ilk oyuncu:

```text
Karo 10
```

attıysa diğer oyuncular ellerinde karo olduğu sürece karo oynamalıdır.

Oyuncunun karo kartı yoksa:

- Koz oynayabilir.
- Başka bir renk oynayabilir.

Varsayılan kural:

```text
MustFollowSuit = true
```

## 9.1 Geçersiz Hamle

Oyuncunun elinde karo olduğu halde sinek atması:

```text
INVALID_MOVE
reason = MUST_FOLLOW_SUIT
```

şeklinde reddedilir.

---

# 10. Trick Kazanma Kuralı

İlk kartın rengi **lider renk** olarak belirlenir.

Öncelik:

1. Koz oynanmışsa en yüksek koz kazanır.
2. Koz yoksa lider renkteki en yüksek kart kazanır.
3. Başka renkteki ve koz olmayan kartlar kazanamaz.

Örnek:

```text
Karo A
Karo 10
Maça 2  <- Koz
Karo K
```

Koz maça ise:

```text
Kazanan = Maça 2
```

---

# 11. El Oynama Sırası

Bir trick:

```text
1. Oyuncu -> kart
2. Oyuncu -> kart
3. Oyuncu -> kart
4. Oyuncu -> kart
```

4. kart oynandığında trick tamamlanır.

Kazanan oyuncu sonraki trick'i başlatır.

Akış:

```text
Lead Player
    ↓
4 Kart
    ↓
Trick Winner
    ↓
Yeni Lead Player
    ↓
4 Kart
```

13 trick tamamlandığında tur biter.

---

# 12. İlk Eli Kimin Başlatacağı

Konfigüre edilebilir:

```text
FirstLeadMode = PlayerAfterDealer
```

Alternatif:

```text
Dealer
HighestBidder
FixedSeat
PreviousWinner
```

Varsayılan olarak ihale kazananın ilk eli başlatması veya ihale sırasındaki yaygın uygulama seçilebilir; UI'da seçilen oyun tipi bu davranışı belirlemelidir.

---

# 13. Mecburi Koz / Koz Kırma

Bazı Batak varyantlarında oyuncu koz oynamak için belirli şartlara uymalıdır.

Örneğin:

- Renk yoksa koz oynanabilir.
- Kozla başlanmadıysa oyuncu elinde lider renk varken koz oynayamaz.

Konfigürasyon:

```json
{
  "trumpCanLead": true,
  "mustTrumpWhenVoid": false,
  "allowTrumpLeadBeforeBroken": true
}
```

---

# 14. İhale Kazananın Taahhüdü

İhale kazanan oyuncu örneğin:

```text
8
```

dediyse en az 8 el almalıdır.

Sonuç:

```text
Alınan: 9
İhale: 8
=> Başarılı
```

veya:

```text
Alınan: 7
İhale: 8
=> Batak
```

---

# 15. Skor Sistemi

Skor sistemi oyun tipine göre değişebileceği için ayrıştırılmalıdır.

## 15.1 İhaleli Batak – Temel Skor

İhale başarılıysa:

```text
Skor += AlınanEl
```

Örneğin:

```text
İhale = 7
Alınan = 8
Skor = +8
```

İhale başarısızsa:

```text
Skor -= İhale
```

Örneğin:

```text
İhale = 7
Alınan = 6
Skor = -7
```

Bu temel puan sistemi konfigüre edilebilir olmalıdır.

---

# 16. Fazla El / Overtrick

İhale 7, alınan 9 ise üç farklı ev kuralı desteklenebilir.

### Mod A – Fazla El Sayılır

```text
+9
```

### Mod B – İhale Puanlanır

```text
+7
```

### Mod C – İhale + Fazla El

```text
+7 + 2
```

Konfigürasyon:

```text
ScoringMode = TakenTricks
BidOnly
BidPlusOvertricks
```

---

# 17. Batak Cezası

İhale yapılmadığında veya ihale alınamadığında ceza değişebilir.

Desteklenebilecek modlar:

```text
PenaltyMode = NegativeBid
NegativeTaken
FixedPenalty
```

Örnek:

```text
Bid = 8
Taken = 5
Penalty = -8
```

---

# 18. Altı / Beş / Minimum İhale Kuralları

Oyun tipine göre minimum ihale:

```text
5
6
7
8
```

olabilir.

Bu nedenle oyun oluştururken:

```json
{
  "minBid": 5
}
```

özelliği bulunmalıdır.

---

# 19. Eşli Batak Kuralları

4 oyuncu:

```text
A ---- C
|      |
B ---- D
```

Takımlar:

```text
Team 1 = A + C
Team 2 = B + D
```

## 19.1 Takım Skoru

Alınan tüm eller takım toplamına yazılır.

Örnek:

```text
A = 4
C = 5
Team = 9
```

İhale takım tarafından başarılmışsa takım skoruna puan eklenir.

---

# 20. Bot / Yapay Zeka Kuralları

Login olmadığı için bot desteği oyunun tek başına oynanabilmesi açısından önemlidir.

Bot seviyeleri:

```text
Easy
Normal
Hard
Expert
```

## 20.1 Easy

- Renge uyar.
- Rastgele geçerli kart seçer.
- Basit ihale yapar.

## 20.2 Normal

- Yüksek kartları hesaba katar.
- Koz sayısını hesaba katar.
- Basit el tahmini yapar.

## 20.3 Hard

- Oynanan kartları takip eder.
- Muhtemel rakip ellerini hesaplar.
- Koz kontrolü yapar.
- Sonraki elleri tahmin eder.

## 20.4 Expert

- Kart sayımı
- Rakip olasılık modeli
- İhale optimizasyonu
- Koz dağılımı tahmini
- Son trick optimizasyonu
- Eşli oyunda partner davranışı tahmini

---

# 21. Kart Sayma Sistemi

Bot veya ileri istatistik ekranı için:

```text
playedCards
knownCards
remainingCards
```

tutulmalıdır.

Örnek:

```text
Maça A
Maça K
Maça Q
```

oynanmışsa sistem kalan maçaları hesaplayabilir.

---

# 22. Oyun Durumları

Oyun motoru state-machine olarak uygulanmalıdır.

Önerilen durumlar:

```text
WAITING
DEALING
BIDDING
TRUMP_SELECTION
PLAYING
TRICK_RESOLUTION
ROUND_SCORING
ROUND_END
GAME_END
ABORTED
```

## 22.1 WAITING

Oyuncular bekler.

## 22.2 DEALING

Kartlar karıştırılır ve dağıtılır.

## 22.3 BIDDING

İhale süreci yapılır.

## 22.4 TRUMP_SELECTION

Koz belirlenir.

## 22.5 PLAYING

Kartlar sırayla oynanır.

## 22.6 TRICK_RESOLUTION

4 kart karşılaştırılır.

## 22.7 ROUND_SCORING

Tur puanı hesaplanır.

## 22.8 GAME_END

Oyun kazanılır.

---

# 23. Oyun Bitiş Koşulları

Oyun hedef skora göre bitebilir.

Örnek:

```text
TargetScore = 101
```

Alternatif:

```text
RoundCount = 10
```

Alternatif:

```text
FixedRounds = 10
```

Varsayılan:

```text
GameEndMode = TargetScore
TargetScore = 101
```

Birden fazla oyuncu hedefi aynı turda aşarsa:

```text
HighestScoreWins
```

kuralı uygulanır.

---

# 24. Beraberlik

Beraberlik durumları:

```text
Score A = 101
Score B = 101
```

Seçenekler:

- Ek tur
- Bir trick daha
- Birinci oyuncu
- Beraberlik kabul

Önerilen:

```text
TieBreaker = ExtraRound
```

---

# 25. Kart Karıştırma

Kriptografik olarak güvenli rastgelelik tercih edilmelidir.

Backend tarafında:

```text
Fisher-Yates Shuffle
```

uygulanabilir.

Kartların istemci tarafında karıştırılması güvenlik açısından önerilmez.

---

# 26. Hile Önleme

Login olmayacak olmasına rağmen oyun server-authoritative olmalıdır.

İstemci:

```text
PlayCard(cardId)
```

gönderir.

Server:

1. Oyuncunun sıra sahibi olduğunu kontrol eder.
2. Kartın oyuncunun elinde olduğunu kontrol eder.
3. Renge uyma kuralını kontrol eder.
4. Hamleyi kabul/reddeder.
5. Yeni oyun durumunu yayınlar.

İstemcinin:

```text
"Ben bu kartı oynadım."
```

demesine güvenilmemelidir.

---

# 27. Oyun Odası Sistemi

Login olmadığından RoomId temel kimlik olacaktır.

Örnek:

```text
RoomId = BAT-8XK4P
```

Oda oluşturma:

```text
Oda Adı
Oyun Tipi
Bot Sayısı
Hedef Skor
İhale Minimumu
Skor Tipi
```

Katılım:

```text
RoomCode gir
-> Odaya katıl
-> Kullanıcı adı gir
-> Koltuk seç
```

---

# 28. Seyirci Modu

Opsiyonel olarak desteklenebilir.

Seyirci:

- Kartları göremez.
- Sadece masayı izler.
- Skoru görür.
- Oyuncu kartlarının arka yüzünü görür.

Konfigürasyon:

```text
AllowSpectators = true
```

---

# 29. Oyundan Çıkma

Bir oyuncu bağlantıyı keserse:

```text
DISCONNECTED
```

durumuna geçer.

Bekleme süresi:

```text
ReconnectTimeout = 60 sec
```

Oyuncu dönerse mevcut eline devam eder.

Dönmezse:

```text
Bot takeover
```

uygulanabilir.

---

# 30. Oyuncu Sırası Zaman Aşımı

Kart oynama süresi:

```text
30 sec
```

İhale süresi:

```text
20 sec
```

Süre aşımında:

### İhale

```text
Pass
```

### Kart

En düşük/geçerli kart otomatik seçilir.

Bot takeover tercih edilirse:

```text
TimeoutAction = Bot
```

---

# 31. Oyun Ayarları Modeli

Önerilen konfigürasyon:

```json
{
  "gameType": "IhaleliBatak",
  "playerCount": 4,
  "deckSize": 52,
  "minBid": 5,
  "maxBid": 13,
  "allowPass": true,
  "allowEqualBid": false,
  "mustFollowSuit": true,
  "trumpSelection": "HighestBidder",
  "scoringMode": "BidPlusOvertricks",
  "targetScore": 101,
  "roundLimit": null,
  "allowSpectators": true,
  "turnTimeoutSeconds": 30,
  "reconnectTimeoutSeconds": 60
}
```

---

# 32. Oyun Veri Modeli

## Game

```text
GameId
RoomId
GameType
Status
CreatedAt
StartedAt
FinishedAt
TargetScore
CurrentRound
DealerPlayerId
CurrentPlayerId
TrumpSuit
HighestBid
HighestBidderPlayerId
```

## Player

```text
PlayerId
GameId
DisplayName
SeatNumber
TeamId
IsBot
BotLevel
IsConnected
Score
RoundScore
Bid
TricksWon
```

## Card

```text
CardId
Suit
Rank
```

## PlayedCard

```text
GameId
Round
TrickNumber
PlayerId
CardId
Sequence
```

## Bid

```text
GameId
Round
PlayerId
Value
Action
Sequence
```

---

# 33. API Önerisi

REST + WebSocket/SignalR kullanılabilir.

## Oda

```http
POST /api/rooms
GET  /api/rooms/{roomId}
POST /api/rooms/{roomId}/join
POST /api/rooms/{roomId}/leave
```

## Oyun

```http
POST /api/games/{gameId}/start
GET  /api/games/{gameId}
POST /api/games/{gameId}/bid
POST /api/games/{gameId}/trump
POST /api/games/{gameId}/play-card
```

## Reconnect

```http
POST /api/games/{gameId}/reconnect
```

---

# 34. SignalR Olayları

Önerilen event isimleri:

```text
RoomUpdated
PlayerJoined
PlayerLeft
GameStarted
CardsDealt
BidStarted
BidPlaced
BidCompleted
TrumpSelected
TurnChanged
CardPlayed
TrickCompleted
RoundCompleted
ScoreUpdated
GameCompleted
PlayerDisconnected
PlayerReconnected
GameAborted
```

---

# 35. İstemci Ekranları

## Ana Sayfa

```text
[Hemen Oyna]
[Oda Oluştur]
[Odaya Katıl]
```

## Kullanıcı Adı

```text
Takma Adını Gir
[Devam Et]
```

## Oyun Tipi

```text
İhaleli Batak
Koz Maça
Eşli Batak
Gömmeli Batak
3-5-8
```

## Masa

```text
             Oyuncu 2

Oyuncu 1       MASA       Oyuncu 3

             Oyuncu 4
```

Alt bölüm:

```text
Elindeki Kartlar
```

---

# 36. Kart UI Kuralları

Kullanıcının oynayamayacağı kartlar:

```text
gri / opacity düşürülmüş
```

Oynanabilir kartlar:

```text
aktif
hover
seçilebilir
```

Seçim sonrası:

```text
Kart yükselir
-> server'a gönderilir
-> server onayı
-> masa güncellenir
```

---

# 37. Animasyonlar

Önerilen animasyonlar:

- Kart dağıtma
- Kart oynama
- Trick kazanma
- Koz seçme
- İhale verme
- Skor değişimi
- Tur bitişi

Ancak animasyon oyun state'inin kaynağı olmamalıdır.

State server tarafından belirlenmelidir.

---

# 38. Sesler

Opsiyonel:

```text
KartAt
KartDagit
Ihale
Pas
KozSecildi
ElKazanildi
Batak
OyunBitti
```

Sesler kullanıcı tarafından kapatılabilir.

---

# 39. Oyun Geçmişi

Login olmayan sistemde geçmiş iki şekilde tutulabilir.

## Geçici

Sadece mevcut oda yaşadığı sürece.

## Tarayıcı Bazlı

LocalStorage'da:

```text
lastGames
wins
losses
bestScore
```

tutulabilir.

Sunucu tarafında kalıcı oyuncu hesabı olmadığı için global kişisel istatistik güvenilir kabul edilmemelidir.

---

# 40. İstatistikler

Oyun içi gösterilebilir:

```text
Alınan El
Verilen İhale
Başarı Oranı
Koz Kullanımı
Toplam Puan
```

Global anonim istatistik tutulacaksa:

```text
anonymousPlayerStats
```

kullanılabilir.

---

# 41. Oyun Motoru İçin Temel Kurallar

GameEngine şu işlerden sorumlu olmalıdır:

```text
ShuffleDeck()
DealCards()
StartBidding()
PlaceBid()
FinishBidding()
SelectTrump()
GetLegalMoves()
PlayCard()
ResolveTrick()
CalculateRoundScore()
AdvanceTurn()
StartNextRound()
CheckGameEnd()
```

---

# 42. GetLegalMoves Mantığı

Bir oyuncu kart oynamak istediğinde:

```text
Elindeki kartları al
        ↓
Lider renk var mı?
        ↓
EVET -> Sadece lider renk
HAYIR -> Tüm kartlar
        ↓
Varyant kurallarını uygula
        ↓
Legal Cards
```

Bu fonksiyon istemci tarafında yalnızca UI kolaylığı için bulunabilir; gerçek kontrol backend'de tekrar yapılmalıdır.

---

# 43. Trick Resolution Algoritması

Pseudo code:

```text
leaderSuit = firstPlayedCard.suit
winningCard = firstPlayedCard

for card in playedCards:
    if card.suit == trumpSuit:
        if winningCard.suit != trumpSuit:
            winningCard = card
        else if card.rank > winningCard.rank:
            winningCard = card
    else if winningCard.suit != trumpSuit:
        if card.suit == leaderSuit and card.rank > winningCard.rank:
            winningCard = card

winner = playerOf(winningCard)
```

Kartların rank değerleri sayısal olarak tutulmalıdır:

```text
2=2
3=3
...
10=10
J=11
Q=12
K=13
A=14
```

---

# 44. Hatalı Hamle Kontrolleri

Backend aşağıdaki durumları reddetmelidir:

```text
NOT_PLAYER_TURN
CARD_NOT_IN_HAND
MUST_FOLLOW_SUIT
BID_TOO_LOW
BID_TOO_HIGH
INVALID_TRUMP
GAME_NOT_STARTED
BIDDING_NOT_ACTIVE
TRUMP_ALREADY_SELECTED
TRICK_ALREADY_COMPLETE
PLAYER_DISCONNECTED
```

---

# 45. Rastgelelik ve Oyun Adaleti

Sunucu tarafında:

```text
RandomNumberGenerator
```

veya güvenli sistem rastgeleliği tercih edilmelidir.

İleri seviye olarak dağıtım sonucu hash'lenip oyun sonunda doğrulama yapılabilir:

```text
shuffleSeed
shuffleHash
```

Böylece oyuncular dağıtımın manipüle edilmediğini teknik olarak inceleyebilir.

---

# 46. Oyun Tipleri İçin Konfigürasyon Mimarisi

Her varyant için tek bir büyük if/else yerine Strategy Pattern önerilir.

```text
IGameRuleSet
    |
    +-- IhaleliBatakRules
    +-- KozMacaRules
    +-- EsliBatakRules
    +-- GommelıBatakRules
    +-- ThreeFiveEightRules
```

Örnek interface:

```csharp
public interface IBatakRuleSet
{
    int GetMinimumBid();
    bool IsBidValid(GameState game, int bid);
    bool IsTrumpSelectionRequired(GameState game);
    IReadOnlyList<Card> GetLegalMoves(GameState game, Player player);
    Player ResolveTrick(GameState game, Trick trick);
    RoundScore CalculateScore(GameState game);
    bool IsRoundFinished(GameState game);
    bool IsGameFinished(GameState game);
}
```

---

# 47. Varyant Matrisi

| Özellik | İhaleli | Koz Maça | Eşli | Gömmeli | 3-5-8 |
|---|---:|---:|---:|---:|---:|
| İhale | ✓ | Opsiyonel | ✓ | ✓ | Özel |
| Koz seçimi | ✓ | Sabit | ✓ | ✓ | Varyanta bağlı |
| 4 oyuncu | ✓ | ✓ | ✓ | ✓ | - |
| 3 oyuncu | Opsiyonel | Opsiyonel | - | Opsiyonel | ✓ |
| Takım | - | - | ✓ | Opsiyonel | - |
| Gömme | - | - | Opsiyonel | ✓ | Varyanta bağlı |
| Minimum ihale | Konfigüre | - | Konfigüre | Konfigüre | Hedef bazlı |
| Bot | ✓ | ✓ | ✓ | ✓ | ✓ |

---

# 48. 3-5-8 İçin Özel Mimari

3-5-8 modu klasik 4 kişilik Batak motoruna zorla bağlanmamalıdır.

Önerilen model:

```text
3 oyuncu
    ↓
Hedefler: 3 / 5 / 8
    ↓
Kart dağıtımı
    ↓
Koz
    ↓
Trick oynama
    ↓
Hedef karşılaştırması
    ↓
Oyuncuların hedefleri güncellenir
```

3-5-8'in farklı uygulamalarında kart değiştirme veya dağıtım sırası gibi ayrıntılar değişebildiği için:

```text
ThreeFiveEightVariant
```

şeklinde ek alt varyant desteği sağlanmalıdır.

---

# 49. Gömmeli Batak İçin Özel Mimari

Gömmeli sistemde kartlar üç gruba ayrılabilir:

```text
Player Hand
Buried Cards
Exposed/Exchange Cards
```

Oyun motoru:

```text
Deal
→ Bid
→ Reveal/Bury phase
→ Exchange phase
→ Trump
→ Play
```

şeklinde farklı state'ler desteklemelidir.

---

# 50. Oyun Odası Kuralları

Oda oluştururken:

```text
GameType
PlayerCount
TargetScore
MinimumBid
ScoreMode
BotLevel
TurnTimeout
AllowSpectators
Private/Public
```

seçilebilir.

Login olmadığı için özel oda erişimi:

```text
RoomCode
```

ile yapılabilir.

---

# 51. Oda Kodu

Örnek:

```text
X7P4K9
```

Kurallar:

- 6 karakter
- Büyük harf/rakam
- Kolay okunabilir karakterler
- O, 0, I, 1 gibi karışabilecek karakterler çıkarılabilir

---

# 52. Güvenlik

Login olmaması güvenlik olmadığı anlamına gelmez.

Backend:

- Rate limiting
- WebSocket connection validation
- Room access validation
- Input validation
- Anti-spam
- Reconnect token
- Oyun state validation

uygulamalıdır.

Oyuncu sadece kendi koltuğundan işlem yapabilmelidir.

---

# 53. Reconnect Token

Login yerine oyun bazlı geçici token kullanılabilir:

```text
ReconnectToken = random-secure-token
```

Bu token kullanıcının:

```text
RoomId
PlayerId
Seat
```

bilgisine tekrar erişmesini sağlar.

Token login yerine geçmez; yalnızca mevcut oyun oturumunu geri kazanmak için kullanılır.

---

# 54. Backend İçin Önerilen Katmanlar

```text
API
 |
 +-- RoomService
 +-- GameService
 +-- MatchmakingService
 +-- ConnectionService
 |
 +-- BatakGameEngine
       |
       +-- RuleSets
       +-- Scoring
       +-- CardEngine
       +-- BotEngine
```

---

# 55. Veritabanı Gereksinimi

Tamamen geçici oyun yapılacaksa DB zorunlu değildir.

Redis veya memory state yeterli olabilir.

Kalıcı oyun geçmişi isteniyorsa PostgreSQL / MSSQL kullanılabilir.

Öneri:

```text
Active Game State -> Redis / Memory
Completed Game -> PostgreSQL
```

Login olmadığı için kullanıcı tablosu zorunlu değildir.

---

# 56. Oyun State JSON Örneği

```json
{
  "gameId": "game-123",
  "gameType": "IhaleliBatak",
  "status": "PLAYING",
  "round": 3,
  "dealer": "p1",
  "currentPlayer": "p3",
  "trump": "SPADES",
  "highestBid": 8,
  "highestBidder": "p2",
  "players": [
    {
      "id": "p1",
      "name": "Erhan",
      "seat": 0,
      "score": 41,
      "bid": null,
      "tricksWon": 3
    }
  ],
  "currentTrick": [
    {
      "playerId": "p3",
      "card": {
        "suit": "DIAMONDS",
        "rank": 14
      }
    }
  ]
}
```

---

# 57. Test Senaryoları

Minimum test listesi:

### Kart dağıtımı

- 52 kartın tamamı dağıtılmalı.
- Aynı kart iki oyuncuda bulunmamalı.
- Her oyuncu 13 kart almalı.

### Renk kuralı

- Lider renk varsa başka renk atılamamalı.
- Lider renk yoksa başka renk atılabilmeli.

### Koz

- Koz, aynı renkteki tüm kartları geçmeli.
- Koz olmayan farklı renkler kazanamamalı.

### İhale

- Minimum teklifin altı reddedilmeli.
- Mevcut teklifin altında/eşit teklif reddedilmeli.
- Pas kabul edilmeli.
- Son teklif sahibi doğru belirlenmeli.

### Skor

- Başarılı ihale doğru puanlanmalı.
- Batak doğru cezalandırılmalı.
- Hedef skorda oyun doğru bitmeli.

### Bağlantı

- Oyuncu çıktığında state korunmalı.
- Reconnect sonrası eli geri gelmeli.

---

# 58. Edge Case'ler

Test edilmesi gereken durumlar:

1. Oyuncu kart oynarken bağlantısı kopuyor.
2. Aynı kart iki kere gönderiliyor.
3. Oyuncu sırası olmayan hamle yapıyor.
4. İhale tamamlandıktan sonra tekrar ihale gönderiliyor.
5. İki oyuncu aynı anda kart oynama isteği gönderiyor.
6. Son trick'te zaman aşımı oluşuyor.
7. Oyun bittiği halde yeni kart oynanıyor.
8. Oyuncu browser refresh yapıyor.
9. Odaya 5. oyuncu girmeye çalışıyor.
10. Host oyundan ayrılıyor.
11. Bot devreye giriyor.
12. Herkes aynı anda reconnect oluyor.

---

# 59. Eşzamanlılık

Aynı oyuna ait işlemler tek bir sıra/lock mekanizması ile işlenmelidir.

Öneri:

```text
GameId bazlı command queue
```

Örneğin iki hamle aynı anda gelirse:

```text
PlayCard(A)
PlayCard(B)
```

server bunları sırayla işler.

İlk geçerli state sonrası ikinci komut tekrar doğrulanır.

---

# 60. Event Sourcing – Opsiyonel

İleri seviye sistemlerde oyun hareketleri event olarak saklanabilir.

Örnek:

```text
GameCreated
PlayerJoined
CardsDealt
BidPlaced
BidPlaced
TrumpSelected
CardPlayed
CardPlayed
CardPlayed
CardPlayed
TrickCompleted
```

Avantajları:

- Replay
- Hata analizi
- Hile inceleme
- Oyun kaydı
- Spectator senkronizasyonu

---

# 61. Replay Sistemi

Oyun sonunda:

```text
GameReplayId
```

oluşturulabilir.

Oyuncu oyunu tekrar izleyebilir:

```text
Başlat
▶
Duraklat
⏩
```

Replay, oyun hareketlerinden yeniden oluşturulabilir.

---

# 62. Chat

Login olmadığı için chat tamamen oda bazlıdır.

Kurallar:

- Spam limiti
- Maksimum mesaj uzunluğu
- Link filtresi
- Küfür/uygunsuz içerik filtresi opsiyonel

Örnek:

```text
Erhan: Koz kupa
Mert: Pas
```

---

# 63. Oyun İçi Bildirimler

```text
"Erhan 7 dedi"
"Mert pas geçti"
"Koz: Maça"
"Erhan eli aldı"
"Ali BATTI!"
```

---

# 64. Mobil Uyumluluk

Kartlar mobil ekrana uygun olmalıdır.

4 oyunculu masa:

```text
        Top
   Left       Right
        Bottom
```

Oyuncunun kendi kartları büyük gösterilir.

Kart seçimi dokunmatik olmalıdır.

---

# 65. Erişilebilirlik

- Renk dışında semboller kullanılmalı.
- ♠ ♥ ♦ ♣ açıkça gösterilmeli.
- Renk körlüğü için kart rengi tek ayırt edici kriter olmamalı.
- Büyük yazı seçeneği eklenebilir.
- Sesler kapatılabilir.

---

# 66. Varsayılan Oyun Konfigürasyonu

İlk sürüm için önerilen varsayılan:

```yaml
gameType: IhaleliBatak
players: 4
deck: 52
minimumBid: 5
maximumBid: 13
allowPass: true
mustFollowSuit: true
trumpSelection: highestBidder
scoring: bidPlusOvertricks
failurePenalty: negativeBid
targetScore: 101
turnTimeoutSeconds: 30
reconnectTimeoutSeconds: 60
allowBots: true
allowSpectators: false
requireLogin: false
```

---

# 67. Login Olmayan Sistem İçin Özel Akış

```text
Ana Sayfa
   ↓
Takma Ad Gir
   ↓
Oyun Tipi Seç
   ↓
Hemen Oyna / Oda Oluştur / Odaya Katıl
   ↓
Oyuncu Koltuğu
   ↓
Rakipler
   ↓
Kart Dağıtımı
   ↓
İhale
   ↓
Koz
   ↓
13 Trick
   ↓
Skor
   ↓
Yeni Tur
   ↓
Hedef Skor
   ↓
Oyun Bitti
```

---

# 68. İlk Sürüm İçin Önerilen Kapsam

İlk MVP'de tüm varyantları aynı anda yapmak yerine:

### Faz 1

- Login yok
- Takma ad
- 4 oyuncu
- Bot desteği
- İhaleli Batak
- 52 kart
- İhale
- Koz seçme
- Renge uyma
- Trick hesaplama
- Skor
- 101 hedefi
- Oda kodu
- Reconnect

### Faz 2

- Eşli Batak
- Koz Maça
- Seyirci
- Chat
- Replay
- İstatistikler

### Faz 3

- Gömmeli Batak
- 3-5-8
- Gelişmiş bot
- Turnuvalar
- Liderlik tablosu

---

# 69. Kuralların Veritabanından Yönetilmesi

Kodun içine sabit kurallar gömmek yerine oyun tipi + varyant tablosu kullanılabilir.

Örnek:

```text
GameRuleSet
--------------
Id
Name
GameType
PlayerCount
MinimumBid
MaximumBid
MustFollowSuit
AllowPass
AllowEqualBid
TrumpMode
ScoringMode
TargetScore
TimeoutSeconds
```

Bu sayede yeni bir Batak varyantı kod değişikliğini azaltarak eklenebilir.

---

# 70. Kural Çakışması Yönetimi

Bir varyant birden fazla kuralı değiştiriyorsa öncelik sırası:

```text
Core Rules
   ↓
Game Type Rules
   ↓
Variant Rules
   ↓
Room Custom Rules
```

Örneğin:

```text
Core: MustFollowSuit = true
Variant: false
Room: true
```

son değer `true` olur.

---

# 71. Sonuç

Bu mimaride Batak oyunu tek bir sabit oyun yerine **kural motoru + varyant sistemi** olarak ele alınmalıdır.

Temel olarak:

```text
                 Batak Game Engine
                        |
        +---------------+---------------+
        |               |               |
      Cards           Turns          Scoring
        |               |               |
        +---------------+---------------+
                        |
                  Rule Strategy
                        |
       +--------+-------+-------+--------+
       |        |       |       |        |
    İhaleli   Koz    Eşli   Gömmeli    3-5-8
               Maça
```

Bu yapı ile daha sonra yeni ev kuralları, farklı skor sistemleri ve yeni Batak türleri mevcut oyun motorunu bozmadan eklenebilir.

---

# 72. Geliştirme İçin Kritik Kararlar

Kodlamaya başlamadan önce aşağıdaki değerler `GameRuleSet` üzerinden belirlenmelidir:

```text
PlayerCount
MinimumBid
MaximumBid
TrumpMode
MustFollowSuit
AllowTrumpLead
AllowPass
AllowEqualBid
AllPassAction
ScoringMode
PenaltyMode
TargetScore
RoundLimit
Timeout
ReconnectTimeout
TeamMode
BuriedCardsMode
FirstLeadMode
```

Özellikle **skor, gömme, ilk kartı kimin attığı, herkesin pas geçmesi ve koz kırma** gibi kuralların farklı Batak uygulamalarında değişebileceği unutulmamalıdır. Bu değerlerin kod içine sabitlenmemesi, oyun tipine/varyanta bağlanması önerilir.
