package br.com.alertsystem.giomobile;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.text.InputType;
import android.view.View;
import android.view.Window;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;

/**
 * GIO Mobile: abre o site do GIO Mobile em tela cheia, com câmera, GPS e endereço configurável.
 * O endereço padrão pode ser trocado no próprio app (botão "Alterar endereço" na tela de erro).
 */
public class MainActivity extends Activity {

    static final String DEFAULT_URL = "https://page-alertsystem.github.io/gestao-de-campo/mobile/";
    static final String PREFS = "gio_mobile";
    static final String KEY_URL = "url";
    static final int REQUEST_FILE = 10;
    static final int REQUEST_PERMISSIONS = 20;

    WebView web;
    ValueCallback<Uri[]> fileCallback;
    Uri cameraUri;
    GeolocationPermissions.Callback pendingGeoCallback;
    String pendingGeoOrigin;
    boolean showingError;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installCrashReporter();
        try {
            requestWindowFeature(Window.FEATURE_NO_TITLE);
            getWindow().setStatusBarColor(Color.parseColor("#CF6800"));
        } catch (Throwable ignored) { }

        try {
            web = new WebView(this);
        } catch (Throwable error) {
            // Acontece quando o "Android System WebView" está desativado, desinstalado ou atualizando.
            new AlertDialog.Builder(this)
                .setTitle("Não foi possível abrir o GIO Mobile")
                .setMessage("Este celular está sem o componente \"Android System WebView\" ativo.\n\nAbra a Play Store, procure por \"Android System WebView\" e toque em Atualizar/Ativar. Depois abra o GIO Mobile de novo.\n\nDetalhe: " + error.getClass().getSimpleName())
                .setPositiveButton("Abrir Play Store", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface dialog, int which) { openExternal("market://details?id=com.google.android.webview"); finish(); }
                })
                .setNegativeButton("Fechar", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface dialog, int which) { finish(); }
                })
                .setCancelable(false)
                .show();
            return;
        }
        web.setBackgroundColor(Color.parseColor("#F3F4F5"));
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString() + " GIOMobileApp/" + versionName());

        web.addJavascriptInterface(new Bridge(), "GIOApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long length) {
                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) openExternal(url);
                else Toast.makeText(MainActivity.this, "O documento fica salvo no GIO e pode ser baixado pelo computador.", Toast.LENGTH_LONG).show();
            }
        });

        requestMissingPermissions();
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(currentUrl());
        showLastCrashIfAny();
    }

    /** Guarda o erro de um eventual fechamento inesperado para mostrar na próxima abertura. */
    void installCrashReporter() {
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            public void uncaughtException(Thread thread, Throwable error) {
                try {
                    StringWriter text = new StringWriter();
                    error.printStackTrace(new PrintWriter(text));
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("last_crash", text.toString()).commit();
                } catch (Throwable ignored) { }
                if (previous != null) previous.uncaughtException(thread, error);
            }
        });
    }

    void showLastCrashIfAny() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String crash = prefs.getString("last_crash", "");
        if (crash == null || crash.isEmpty()) return;
        prefs.edit().remove("last_crash").apply();
        String shortText = crash.length() > 1500 ? crash.substring(0, 1500) : crash;
        new AlertDialog.Builder(this)
            .setTitle("O GIO Mobile fechou da última vez")
            .setMessage("Envie uma foto desta tela para a TI:\n\n" + shortText)
            .setPositiveButton("OK", null)
            .show();
    }

    String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception e) { return "1"; }
    }

    String currentUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String saved = prefs.getString(KEY_URL, "");
        return saved == null || saved.trim().isEmpty() ? DEFAULT_URL : saved.trim();
    }

    void saveUrl(String url) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_URL, url).apply();
    }

    void requestMissingPermissions() {
        List<String> missing = new ArrayList<String>();
        String[] wanted = Build.VERSION.SDK_INT < 29
            ? new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.CAMERA, Manifest.permission.WRITE_EXTERNAL_STORAGE }
            : new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.CAMERA };
        for (String permission : wanted) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) missing.add(permission);
        }
        if (!missing.isEmpty()) requestPermissions(missing.toArray(new String[0]), REQUEST_PERMISSIONS);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (pendingGeoCallback != null) {
            boolean granted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (ActivityNotFoundException e) { Toast.makeText(this, "Não há aplicativo para abrir este link.", Toast.LENGTH_SHORT).show(); }
    }

    void askNewUrl() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(currentUrl());
        input.setSelectAllOnFocus(true);
        new AlertDialog.Builder(this)
            .setTitle("Endereço do GIO Mobile")
            .setMessage("Informe o endereço fornecido pela equipe de TI.\nNa rede da empresa: http://192.168.227.227:4173/mobile/")
            .setView(input)
            .setPositiveButton("Salvar", new DialogInterface.OnClickListener() {
                public void onClick(DialogInterface dialog, int which) {
                    String url = input.getText().toString().trim();
                    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
                    saveUrl(url);
                    showingError = false;
                    web.loadUrl(url);
                }
            })
            .setNeutralButton("Padrão", new DialogInterface.OnClickListener() {
                public void onClick(DialogInterface dialog, int which) {
                    saveUrl("");
                    showingError = false;
                    web.loadUrl(DEFAULT_URL);
                }
            })
            .setNegativeButton("Cancelar", null)
            .show();
    }

    void showError(String detail) {
        showingError = true;
        String safe = detail == null ? "" : detail.replace("<", "&lt;");
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
            + "<style>body{font-family:sans-serif;background:#f3f4f5;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;color:#242729}"
            + ".c{background:#fff;margin:20px;padding:28px 22px;border-radius:20px;box-shadow:0 14px 42px rgba(35,38,40,.08);text-align:center;max-width:420px}"
            + "h1{font-size:21px;margin:12px 0 8px}p{color:#70757a;font-size:15px;line-height:1.45}small{color:#9aa0a5;word-break:break-all}"
            + "button{display:block;width:100%;min-height:52px;border:0;border-radius:14px;font-size:16px;font-weight:700;margin-top:12px}"
            + ".p{background:#f58200;color:#fff}.s{background:#eef0f1;color:#303336}.i{font-size:42px}</style></head><body><div class='c'>"
            + "<div class='i'>📶</div><h1>Não foi possível abrir o GIO</h1><p>Verifique a internet do celular. Se o problema continuar, confirme o endereço com a TI.</p>"
            + "<small>" + currentUrl() + "<br>" + safe + "</small>"
            + "<button class='p' onclick='GIOApp.tentarNovamente()'>Tentar novamente</button>"
            + "<button class='s' onclick='GIOApp.alterarEndereco()'>Alterar endereço</button></div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    class Bridge {
        @JavascriptInterface public void tentarNovamente() {
            runOnUiThread(new Runnable() { public void run() { showingError = false; web.loadUrl(currentUrl()); } });
        }
        @JavascriptInterface public void alterarEndereco() {
            runOnUiThread(new Runnable() { public void run() { askNewUrl(); } });
        }
        @JavascriptInterface public String versao() { return versionName(); }
    }

    class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            if (scheme.equals("http") || scheme.equals("https")) {
                String path = uri.getPath() == null ? "" : uri.getPath();
                Uri home = Uri.parse(currentUrl());
                boolean sameHost = uri.getHost() != null && uri.getHost().equalsIgnoreCase(home.getHost());
                if (sameHost && !path.endsWith(".apk")) return false;
            }
            openExternal(uri.toString());
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && !showingError) showError(String.valueOf(error.getDescription()));
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && !showingError && response != null && response.getStatusCode() >= 400) {
                showError("Erro " + response.getStatusCode() + ": o GIO Mobile não foi encontrado neste endereço.");
            }
        }
    }

    class Chrome extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                callback.invoke(origin, true, false);
            } else {
                pendingGeoCallback = callback;
                pendingGeoOrigin = origin;
                requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQUEST_PERMISSIONS);
            }
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            cameraUri = null;

            boolean images = true;
            String[] accept = params.getAcceptTypes();
            if (accept != null) for (String type : accept) if (type != null && type.length() > 0 && !type.startsWith("image")) images = false;

            Intent content = new Intent(Intent.ACTION_GET_CONTENT);
            content.addCategory(Intent.CATEGORY_OPENABLE);
            content.setType(images ? "image/*" : "*/*");
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

            List<Intent> extras = new ArrayList<Intent>();
            if (images && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                try {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.TITLE, "GIO " + System.currentTimeMillis());
                    values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (cameraUri != null) {
                        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        extras.add(camera);
                    }
                } catch (Exception ignored) { cameraUri = null; }
            }

            Intent chooser;
            if (params.isCaptureEnabled() && !extras.isEmpty()) {
                chooser = extras.get(0);
            } else {
                chooser = Intent.createChooser(content, "Selecionar foto");
                if (!extras.isEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extras.toArray(new Intent[0]));
            }
            try {
                startActivityForResult(chooser, REQUEST_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_FILE || fileCallback == null) { super.onActivityResult(requestCode, resultCode, data); return; }
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                result = new Uri[count];
                for (int i = 0; i < count; i++) result[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                result = new Uri[] { data.getData() };
            } else if (cameraUri != null) {
                result = new Uri[] { cameraUri };
            }
        }
        if (result == null && cameraUri != null) {
            try { getContentResolver().delete(cameraUri, null, null); } catch (Exception ignored) { }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
        cameraUri = null;
    }

    private long lastBack;

    @Override
    public void onBackPressed() {
        if (web.canGoBack() && !showingError) { web.goBack(); return; }
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) { super.onBackPressed(); return; }
        lastBack = now;
        Toast.makeText(this, "Toque de novo para sair do GIO Mobile", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }
}
