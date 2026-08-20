package com.mycommute.app;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.zxing.client.android.Intents;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "Commute")
public class CommutePlugin extends Plugin {
    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(CommuteStore.getState(getContext()));
    }

    @PluginMethod
    public void scanQr(PluginCall call) {
        Intent intent = new Intent(getActivity(), ScannerActivity.class);
        intent.setAction(Intents.Scan.ACTION);
        intent.putExtra(Intents.Scan.FORMATS, "QR_CODE");
        intent.putExtra(Intents.Scan.PROMPT_MESSAGE, "QR 코드를 사각형 안에 맞춰주세요");
        intent.putExtra(Intents.Scan.BEEP_ENABLED, true);
        intent.putExtra(Intents.Scan.ORIENTATION_LOCKED, true);
        startActivityForResult(call, intent, "scanResult");
    }

    @ActivityCallback
    private void scanResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        Intent data = activityResult.getData();
        if (activityResult.getResultCode() == Activity.RESULT_OK && data != null) {
            String rawValue = data.getStringExtra(Intents.Scan.RESULT);
            call.resolve(CommuteStore.scan(getContext(), rawValue));
            return;
        }
        JSObject result = new JSObject();
        result.put("outcome", "cancelled");
        result.put("state", CommuteStore.getState(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void saveSettings(PluginCall call) {
        JSObject settings = new JSObject();
        settings.put("checkinTime", call.getString("checkinTime", "09:00"));
        settings.put("checkoutTime", call.getString("checkoutTime", "20:00"));
        settings.put("checkinFine", call.getInt("checkinFine", 10000));
        settings.put("checkoutFine", call.getInt("checkoutFine", 10000));
        settings.put("gymCredit", call.getInt("gymCredit", 10000));
        CommuteStore.saveSettings(getContext(), settings);
        AlarmScheduler.scheduleAll(getContext());
        JSObject result = new JSObject();
        result.put("state", CommuteStore.getState(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void addException(PluginCall call) {
        JSArray values = call.getArray("types", new JSArray());
        List<String> types = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            String type = values.optString(index, "");
            if ("checkin".equals(type) || "checkout".equals(type)) types.add(type);
        }
        String reason = call.getString("reason", "").trim();
        if (types.isEmpty() || reason.isEmpty()) {
            call.reject("항목과 사유가 필요합니다.");
            return;
        }
        CommuteStore.addException(getContext(), types, reason);
        JSObject result = new JSObject();
        result.put("state", CommuteStore.getState(getContext()));
        call.resolve(result);
    }
}
