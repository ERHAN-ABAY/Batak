# Flutter Android iskeletini olusturur ve Batak icin gerekli yamalari uygular.
# Kullanim:  cd packages/mobile ; ./setup.ps1 ; flutter build apk --release
$ErrorActionPreference = 'Stop'
flutter create --platforms=android --org com.batak --project-name batak_mobile .
$m = 'android/app/src/main/AndroidManifest.xml'
$x = Get-Content $m -Raw
if ($x -notmatch 'INTERNET') {
  $x = $x -replace '<application', "<uses-permission android:name=`"android.permission.INTERNET`"/>`n    <application"
}
# Sunucu http:// (https degil) oldugu icin acik metin trafigine izin ver.
if ($x -notmatch 'usesCleartextTraffic') {
  $x = $x -replace '<application', '<application android:usesCleartextTraffic="true"'
}
$x = $x -replace 'android:label="[^"]*"', 'android:label="Batak"'
Set-Content $m $x -Encoding utf8
flutter pub get
Write-Host "Hazir. APK icin: flutter build apk --release"
