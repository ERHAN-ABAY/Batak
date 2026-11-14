# Batak Mobile (Flutter)

Sunucudaki (`http://152.239.117.213:3737/`) online Batak oyununu acan Android uygulamasi.
Oyun sunucudan servis edildigi icin sunucu guncellenince uygulama da otomatik guncel olur.

- Adres degistirmek: baglanti hatasi ekranindaki "Sunucu adresini degistir" veya `lib/main.dart` -> `kDefaultServerUrl`.
- Sunucu `http://` oldugu icin Android'de `usesCleartextTraffic` acilir (setup.ps1 yapar).

## APK uretme
Gereken: Flutter SDK + Android SDK (JDK 17).
```
cd packages/mobile
./setup.ps1
flutter build apk --release
# cikti: build/app/outputs/flutter-apk/app-release.apk
```
GitHub'a push edince `.github/workflows/mobile-apk.yml` APK'yi artifact olarak da uretir.
