import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Varsayilan sunucu adresi. Ayarlardan degistirilebilir.
const String kDefaultServerUrl = 'http://152.239.117.213:3737/';
const String kPrefKey = 'server_url';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  final prefs = await SharedPreferences.getInstance();
  runApp(BatakApp(prefs: prefs));
}

class BatakApp extends StatelessWidget {
  const BatakApp({super.key, required this.prefs});
  final SharedPreferences prefs;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Batak',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0B6B3A),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: GamePage(prefs: prefs),
    );
  }
}

class GamePage extends StatefulWidget {
  const GamePage({super.key, required this.prefs});
  final SharedPreferences prefs;

  @override
  State<GamePage> createState() => _GamePageState();
}

class _GamePageState extends State<GamePage> with WidgetsBindingObserver {
  late final WebViewController _controller;
  late String _url;
  int _progress = 0;
  bool _failed = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _url = _normalize(widget.prefs.getString(kPrefKey) ?? kDefaultServerUrl);
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0B1F14))
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => setState(() => _progress = p),
        onPageStarted: (_) => setState(() => _failed = false),
        onWebResourceError: (e) {
          if (e.isForMainFrame ?? true) {
            setState(() {
              _failed = true;
              _error = e.description;
            });
          }
        },
        // Sadece oyun sunucusunun icinde gezin.
        onNavigationRequest: (req) {
          final target = Uri.tryParse(req.url);
          final base = Uri.tryParse(_url);
          if (target != null && base != null && target.host == base.host) {
            return NavigationDecision.navigate;
          }
          return NavigationDecision.prevent;
        },
      ))
      ..loadRequest(Uri.parse(_url));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Uygulama one gelince baglanti kopmussa sayfayi yenile.
    if (state == AppLifecycleState.resumed && _failed) _reload();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  static String _normalize(String u) {
    u = u.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'http://$u';
    return u;
  }

  void _reload() {
    setState(() => _failed = false);
    _controller.loadRequest(Uri.parse(_url));
  }

  Future<void> _editUrl() async {
    final ctrl = TextEditingController(text: _url);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sunucu adresi'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(hintText: kDefaultServerUrl),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, kDefaultServerUrl),
            child: const Text('Varsayilan'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Iptal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text),
            child: const Text('Kaydet'),
          ),
        ],
      ),
    );
    if (result == null) return;
    _url = _normalize(result);
    await widget.prefs.setString(kPrefKey, _url);
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else {
          final exit = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Cikis'),
              content: const Text('Uygulamadan cikilsin mi?'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Hayir')),
                FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Evet')),
              ],
            ),
          );
          if (exit == true) SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF0B1F14),
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_progress < 100 && !_failed)
                LinearProgressIndicator(value: _progress / 100),
              if (_failed) _buildError(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildError() {
    return Container(
      color: const Color(0xFF0B1F14),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.wifi_off, size: 64),
          const SizedBox(height: 16),
          const Text('Sunucuya baglanilamadi',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(_url, textAlign: TextAlign.center),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(_error,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: Colors.white54)),
          ],
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: _reload,
            icon: const Icon(Icons.refresh),
            label: const Text('Tekrar dene'),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: _editUrl,
            icon: const Icon(Icons.settings),
            label: const Text('Sunucu adresini degistir'),
          ),
        ],
      ),
    );
  }
}
