package com.mycommute.app;

import android.Manifest;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private GmsBarcodeScanner qrScanner;
    private WebView webView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build();
        qrScanner = GmsBarcodeScanning.getClient(this, options);

        // The app UI is local HTML. Expose a small, explicit native bridge so the
        // scanner does not depend on Capacitor's custom-plugin discovery.
        webView = getBridge().getWebView();
        webView.addJavascriptInterface(new TimeMoneyNativeBridge(), "TimeMoneyNative");
        webView.post(webView::reload);

        NotificationHelper.createChannel(this);
        AlarmScheduler.scheduleAll(this);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 2001);
        }
    }

    private void startQrScan() {
        qrScanner.startScan()
            .addOnSuccessListener(barcode -> deliverScanResult(CommuteStore.scan(this, barcode.getRawValue())))
            .addOnCanceledListener(() -> deliverScanResult(scanOutcome("cancelled", null)))
            .addOnFailureListener(error -> deliverScanResult(scanOutcome("error", error.getLocalizedMessage())));
    }

    private JSObject scanOutcome(String outcome, String message) {
        JSObject result = new JSObject();
        result.put("outcome", outcome);
        if (message != null && !message.isEmpty()) result.put("message", message);
        result.put("state", CommuteStore.getState(this));
        return result;
    }

    private void deliverScanResult(JSObject result) {
        String script = "window.__timeMoneyNativeScanResult && window.__timeMoneyNativeScanResult(" + result + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private JSObject stateResult() {
        JSObject result = new JSObject();
        result.put("state", CommuteStore.getState(this));
        return result;
    }

    public final class TimeMoneyNativeBridge {
        @JavascriptInterface
        public String getState() {
            return CommuteStore.getState(MainActivity.this).toString();
        }

        @JavascriptInterface
        public void scanQr() {
            runOnUiThread(MainActivity.this::startQrScan);
        }

        @JavascriptInterface
        public String saveSettings(String json) {
            try {
                JSONObject source = new JSONObject(json);
                JSObject settings = new JSObject();
                settings.put("checkinTime", source.optString("checkinTime", "09:00"));
                settings.put("checkoutTime", source.optString("checkoutTime", "20:00"));
                settings.put("checkinFine", source.optInt("checkinFine", 10000));
                settings.put("checkoutFine", source.optInt("checkoutFine", 10000));
                settings.put("gymCredit", source.optInt("gymCredit", 10000));
                CommuteStore.saveSettings(MainActivity.this, settings);
                AlarmScheduler.scheduleAll(MainActivity.this);
            } catch (Exception ignored) {}
            return stateResult().toString();
        }

        @JavascriptInterface
        public String addException(String json) {
            try {
                JSONObject source = new JSONObject(json);
                JSONArray values = source.optJSONArray("types");
                List<String> types = new ArrayList<>();
                if (values != null) {
                    for (int index = 0; index < values.length(); index++) {
                        String type = values.optString(index, "");
                        if ("checkin".equals(type) || "checkout".equals(type)) types.add(type);
                    }
                }
                String reason = source.optString("reason", "").trim();
                if (!types.isEmpty() && !reason.isEmpty()) CommuteStore.addException(MainActivity.this, types, reason);
            } catch (Exception ignored) {}
            return stateResult().toString();
        }
    }
}
