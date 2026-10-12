package com.xutang.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;

// WebView 外壳：把 assets/web 当成 https://xutang.local/ 下的站点来提供。
// 用 https 而不是 file://，是因为 file:// 下 localStorage 和 fetch 本地文件都不可靠。
public class MainActivity extends Activity {
    private static final String HOST = "xutang.local";
    private static final int PICK = 1;
    private WebView web;
    private ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        // WebView 自身的 padding 不会让网页内容让位（fixed 顶栏照样画到状态栏下），所以套一层容器来留白
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        root.addView(web);
        setContentView(root);
        // targetSdk 35 强制全面屏：按状态栏/导航栏/刘海/键盘高度给容器留出内边距
        getWindow().setStatusBarColor(0xFF000000);
        getWindow().setNavigationBarColor(0xFF000000);
        root.setOnApplyWindowInsetsListener((v, in) -> {
            int top, bottom, left, right;
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = in.getInsets(android.view.WindowInsets.Type.systemBars()
                        | android.view.WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = in.getInsets(android.view.WindowInsets.Type.ime());
                top = i.top; left = i.left; right = i.right; bottom = Math.max(i.bottom, ime.bottom);
            } else {
                top = in.getSystemWindowInsetTop(); bottom = in.getSystemWindowInsetBottom();
                left = in.getSystemWindowInsetLeft(); right = in.getSystemWindowInsetRight();
            }
            v.setPadding(left, top, right, bottom);
            return in;
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // 存档靠它
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;   // 外部请求（AI 接口、音乐）照常走网络
                String path = u.getPath() == null ? "/" : u.getPath();
                if (path.endsWith("/")) path += "index.html";
                try {
                    InputStream in = getAssets().open("web" + path);
                    return new WebResourceResponse(mime(path), "utf-8", in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                            Collections.<String, String>emptyMap(), null);
                }
            }
        });

        // 接上 <input type=file>，导入存档要用；alert/confirm/prompt 换成与软件同风格的弹窗
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView v, String url, String msg, android.webkit.JsResult r) {
                showDlg(msg, false, null, ok -> r.confirm());
                return true;
            }
            @Override
            public boolean onJsConfirm(WebView v, String url, String msg, android.webkit.JsResult r) {
                showDlg(msg, true, null, ok -> { if (ok != null) r.confirm(); else r.cancel(); });
                return true;
            }
            @Override
            public boolean onJsPrompt(WebView v, String url, String msg, String def, android.webkit.JsPromptResult r) {
                showDlg(msg, true, def == null ? "" : def, val -> { if (val != null) r.confirm(val); else r.cancel(); });
                return true;
            }
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                try {
                    Intent it = p.createIntent();
                    if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(it, PICK);
                }
                catch (Exception e) { pending = null; return false; }
                return true;
            }
        });

        if (b != null) web.restoreState(b);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    // 网页导出调用：写到公共「下载」目录，返回路径；失败返回 "ERR:原因"
    private class Bridge {
        @android.webkit.JavascriptInterface
        public String saveFile(String name, String text) {
            String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            byte[] data = text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            try {
                if (android.os.Build.VERSION.SDK_INT >= 29) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    cv.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/json");
                    cv.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, "Download/絮糖");
                    Uri u = getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (u == null) return "ERR:系统拒绝创建文件";
                    try (java.io.OutputStream o = getContentResolver().openOutputStream(u)) { o.write(data); }
                    // 重名时系统会自动加 (1)，回读真实文件名
                    String real = safe;
                    try (android.database.Cursor c = getContentResolver().query(u,
                            new String[]{android.provider.MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
                        if (c != null && c.moveToFirst()) real = c.getString(0);
                    }
                    return "/sdcard/Download/絮糖/" + real;
                } else {
                    // Android 9 及以下没有存储权限时，写到本应用的外部目录（同样能在文件管理里找到）
                    java.io.File dir = new java.io.File(getExternalFilesDir(null), "导出");
                    dir.mkdirs();
                    java.io.File f = new java.io.File(dir, safe);
                    try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(data); }
                    return f.getAbsolutePath();
                }
            } catch (Exception e) {
                return "ERR:" + e.getMessage();
            }
        }
    }

    // ============ 自定义弹窗：沿用网页配色（底 #0d0d0d、边 #333、标题米金、主按钮蓝） ============
    private interface Done { void on(String v); }   // v == null 表示取消；确定时 alert/confirm 传 ""，prompt 传输入值

    private int dp(float d) { return Math.round(d * getResources().getDisplayMetrics().density); }

    private android.graphics.drawable.GradientDrawable box(int fill, int stroke, float radius) {
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setColor(fill); g.setStroke(dp(1), stroke); g.setCornerRadius(dp(radius));
        return g;
    }

    private android.widget.TextView btn(String t, boolean primary) {
        android.widget.TextView b = new android.widget.TextView(this);
        b.setText(t); b.setTextSize(15); b.setGravity(android.view.Gravity.CENTER);
        b.setTextColor(primary ? 0xFF8BB8FF : 0xFFAAAAAA);
        b.setBackground(box(0xFF151515, primary ? 0xFF4F8FE6 : 0xFF333333, 4));
        b.setPadding(dp(18), dp(8), dp(18), dp(8));
        b.setMinWidth(dp(72));
        return b;
    }

    private void showDlg(String msg, boolean cancelable, String input, Done done) {
        final boolean[] fired = {false};
        final android.app.Dialog d = new android.app.Dialog(this);
        d.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE);

        android.widget.LinearLayout col = new android.widget.LinearLayout(this);
        col.setOrientation(android.widget.LinearLayout.VERTICAL);
        col.setBackground(box(0xFF0D0D0D, 0xFF333333, 8));
        col.setPadding(dp(20), dp(16), dp(20), dp(16));

        android.widget.TextView title = new android.widget.TextView(this);
        title.setText("絮糖"); title.setTextSize(16); title.setTextColor(0xFFE8D8B0);
        title.setPadding(0, 0, 0, dp(8));
        col.addView(title);
        android.view.View line = new android.view.View(this);
        line.setBackgroundColor(0xFF222222);
        col.addView(line, new android.widget.LinearLayout.LayoutParams(-1, dp(1)));

        // 长消息（报错清单）可滚动，最高占屏幕 55%
        android.widget.ScrollView sv = new android.widget.ScrollView(this);
        android.widget.TextView body = new android.widget.TextView(this);
        body.setText(msg == null ? "" : msg); body.setTextSize(15); body.setTextColor(0xFFDDDDDD);
        body.setLineSpacing(0, 1.4f); body.setTextIsSelectable(true);
        body.setPadding(0, dp(12), 0, dp(12));
        sv.addView(body);
        int maxH = (int) (getResources().getDisplayMetrics().heightPixels * 0.55);
        body.measure(android.view.View.MeasureSpec.makeMeasureSpec(
                (int) (getResources().getDisplayMetrics().widthPixels * 0.86) - dp(40), android.view.View.MeasureSpec.AT_MOST),
                android.view.View.MeasureSpec.UNSPECIFIED);
        col.addView(sv, new android.widget.LinearLayout.LayoutParams(-1, Math.min(body.getMeasuredHeight(), maxH)));

        final android.widget.EditText et;
        if (input != null) {
            et = new android.widget.EditText(this);
            et.setText(input); et.setSelection(input.length());
            et.setTextColor(0xFFDDDDDD); et.setHintTextColor(0xFF777777); et.setTextSize(15);
            et.setBackground(box(0xFF151515, 0xFF333333, 4));
            et.setPadding(dp(10), dp(8), dp(10), dp(8));
            android.widget.LinearLayout.LayoutParams lp = new android.widget.LinearLayout.LayoutParams(-1, -2);
            lp.bottomMargin = dp(12);
            col.addView(et, lp);
        } else et = null;

        android.widget.LinearLayout row = new android.widget.LinearLayout(this);
        row.setGravity(android.view.Gravity.END);
        if (cancelable) {
            android.widget.TextView no = btn("取消", false);
            no.setOnClickListener(x -> { if (!fired[0]) { fired[0] = true; done.on(null); } d.dismiss(); });
            android.widget.LinearLayout.LayoutParams lp = new android.widget.LinearLayout.LayoutParams(-2, -2);
            lp.rightMargin = dp(10);
            row.addView(no, lp);
        }
        android.widget.TextView yes = btn("确定", true);
        yes.setOnClickListener(x -> {
            if (!fired[0]) { fired[0] = true; done.on(et != null ? et.getText().toString() : ""); }
            d.dismiss();
        });
        row.addView(yes);
        col.addView(row);

        d.setContentView(col);
        // 返回键/点外面：confirm、prompt 视为取消；alert 视为确定（网页必须得到结果才会继续）
        d.setCanceledOnTouchOutside(cancelable);
        d.setOnDismissListener(x -> { if (!fired[0]) { fired[0] = true; done.on(cancelable ? null : ""); } });
        android.view.Window w = d.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
            w.setLayout((int) (getResources().getDisplayMetrics().widthPixels * 0.86), -2);
            w.setDimAmount(0.7f);
        }
        d.show();
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK && pending != null) {
            // parseResult 只认单个文件；多选时文件在 ClipData 里，要自己取出来
            Uri[] out = null;
            if (res == RESULT_OK && data != null && data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                out = new Uri[n];
                for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
            } else {
                out = WebChromeClient.FileChooserParams.parseResult(res, data);
            }
            pending.onReceiveValue(out);
            pending = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }

    @Override
    public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}