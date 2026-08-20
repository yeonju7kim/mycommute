package com.mycommute.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

public final class CommuteStore {
    public static final String CHECKIN_CODE = "MYCOMMUTE:CHECKIN:v1:LAB";
    public static final String CHECKOUT_CODE = "MYCOMMUTE:CHECKOUT:v1:LAB";
    public static final String GYM_CODE = "MYCOMMUTE:GYM:v1:LAB";
    private static final String PREFS = "time_is_money_data";
    private static final String RECORD_PREFIX = "record|";
    private static final Locale KOREAN = Locale.KOREA;

    private CommuteStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void initialize(Context context) {
        SharedPreferences preferences = prefs(context);
        if (!preferences.contains("installedAt")) {
            preferences.edit()
                .putLong("installedAt", System.currentTimeMillis())
                .putString("checkinTime", "09:00")
                .putString("checkoutTime", "20:00")
                .putInt("checkinFine", 10000)
                .putInt("checkoutFine", 10000)
                .putInt("gymCredit", 10000)
                .apply();
        }
    }

    private static String dateText(long millis) {
        return new SimpleDateFormat("yyyy-MM-dd", KOREAN).format(new Date(millis));
    }

    private static String timeText(long millis) {
        return new SimpleDateFormat("HH:mm", KOREAN).format(new Date(millis));
    }

    private static String recordKey(String date, String type) {
        return RECORD_PREFIX + date + "|" + type;
    }

    private static JSONObject record(String date, String type, String status, String time, int amount, String reason) {
        JSONObject value = new JSONObject();
        try {
            value.put("date", date);
            value.put("type", type);
            value.put("status", status);
            value.put("time", time);
            value.put("amount", amount);
            value.put("reason", reason == null ? "" : reason);
        } catch (JSONException ignored) {}
        return value;
    }

    private static JSONObject readRecord(Context context, String date, String type) {
        String value = prefs(context).getString(recordKey(date, type), null);
        if (value == null) return null;
        try {
            return new JSONObject(value);
        } catch (JSONException ignored) {
            return null;
        }
    }

    private static void writeRecord(Context context, JSONObject value) {
        String date = value.optString("date", "");
        String type = value.optString("type", "");
        if (date.isEmpty() || type.isEmpty()) return;
        prefs(context).edit().putString(recordKey(date, type), value.toString()).apply();
    }

    private static long deadlineMillis(String date, String time) {
        try {
            return new SimpleDateFormat("yyyy-MM-dd HH:mm", KOREAN).parse(date + " " + time).getTime();
        } catch (Exception ignored) {
            return Long.MAX_VALUE;
        }
    }

    private static String settingTime(Context context, String type) {
        return prefs(context).getString(type + "Time", "checkin".equals(type) ? "09:00" : "20:00");
    }

    private static int settingAmount(Context context, String type) {
        return prefs(context).getInt(type + "Fine", 10000);
    }

    public static synchronized void reconcile(Context context) {
        initialize(context);
        SharedPreferences preferences = prefs(context);
        long now = System.currentTimeMillis();
        long installedAt = preferences.getLong("installedAt", now);
        Calendar cursor = Calendar.getInstance();
        cursor.setTimeInMillis(installedAt);
        cursor.set(Calendar.HOUR_OF_DAY, 0);
        cursor.set(Calendar.MINUTE, 0);
        cursor.set(Calendar.SECOND, 0);
        cursor.set(Calendar.MILLISECOND, 0);
        Calendar today = Calendar.getInstance();
        today.set(Calendar.HOUR_OF_DAY, 0);
        today.set(Calendar.MINUTE, 0);
        today.set(Calendar.SECOND, 0);
        today.set(Calendar.MILLISECOND, 0);
        int guard = 0;
        while (!cursor.after(today) && guard < 740) {
            String date = dateText(cursor.getTimeInMillis());
            for (String type : new String[]{"checkin", "checkout"}) {
                long deadline = deadlineMillis(date, settingTime(context, type));
                if (readRecord(context, date, type) == null && installedAt <= deadline && now > deadline) {
                    writeRecord(context, record(date, type, "failed", "", settingAmount(context, type), ""));
                }
            }
            cursor.add(Calendar.DAY_OF_MONTH, 1);
            guard += 1;
        }
    }

    public static synchronized JSObject scan(Context context, String rawValue) {
        reconcile(context);
        String type = typeForCode(rawValue);
        JSObject result = new JSObject();
        if (type == null) {
            result.put("outcome", "unknown");
            result.put("state", getState(context));
            return result;
        }
        long now = System.currentTimeMillis();
        String date = dateText(now);
        JSONObject existing = readRecord(context, date, type);
        if (existing != null) {
            result.put("outcome", "duplicate");
            result.put("record", toJs(existing));
            result.put("state", getState(context));
            return result;
        }
        JSONObject value;
        String outcome;
        if ("gym".equals(type)) {
            value = record(date, type, "credit", timeText(now), prefs(context).getInt("gymCredit", 10000), "");
            outcome = "gym";
        } else {
            boolean late = now > deadlineMillis(date, settingTime(context, type));
            value = record(date, type, late ? "failed" : "success", timeText(now), late ? settingAmount(context, type) : 0, "");
            outcome = late ? "late" : "success";
        }
        writeRecord(context, value);
        result.put("outcome", outcome);
        result.put("record", toJs(value));
        result.put("state", getState(context));
        return result;
    }

    private static String typeForCode(String value) {
        if (CHECKIN_CODE.equals(value)) return "checkin";
        if (CHECKOUT_CODE.equals(value)) return "checkout";
        if (GYM_CODE.equals(value)) return "gym";
        return null;
    }

    public static synchronized void addException(Context context, List<String> types, String reason) {
        initialize(context);
        long now = System.currentTimeMillis();
        String date = dateText(now);
        for (String type : types) {
            if ("checkin".equals(type) || "checkout".equals(type)) {
                writeRecord(context, record(date, type, "excused", timeText(now), 0, reason));
            }
        }
    }

    public static synchronized void saveSettings(Context context, JSObject settings) {
        initialize(context);
        prefs(context).edit()
            .putString("checkinTime", validTime(settings.optString("checkinTime", "09:00"), "09:00"))
            .putString("checkoutTime", validTime(settings.optString("checkoutTime", "20:00"), "20:00"))
            .putInt("checkinFine", Math.max(0, settings.optInt("checkinFine", 10000)))
            .putInt("checkoutFine", Math.max(0, settings.optInt("checkoutFine", 10000)))
            .putInt("gymCredit", Math.max(0, settings.optInt("gymCredit", 10000)))
            .apply();
    }

    private static String validTime(String value, String fallback) {
        return value != null && value.matches("(?:[01]\\d|2[0-3]):[0-5]\\d") ? value : fallback;
    }

    private static JSObject settings(Context context) {
        SharedPreferences preferences = prefs(context);
        JSObject value = new JSObject();
        value.put("checkinTime", preferences.getString("checkinTime", "09:00"));
        value.put("checkoutTime", preferences.getString("checkoutTime", "20:00"));
        value.put("checkinFine", preferences.getInt("checkinFine", 10000));
        value.put("checkoutFine", preferences.getInt("checkoutFine", 10000));
        value.put("gymCredit", preferences.getInt("gymCredit", 10000));
        JSArray days = new JSArray();
        for (int day = 1; day <= 7; day++) days.put(day);
        value.put("activeDays", days);
        return value;
    }

    private static List<JSONObject> records(Context context) {
        List<JSONObject> result = new ArrayList<>();
        for (Map.Entry<String, ?> entry : prefs(context).getAll().entrySet()) {
            if (!entry.getKey().startsWith(RECORD_PREFIX) || !(entry.getValue() instanceof String)) continue;
            try {
                result.add(new JSONObject((String) entry.getValue()));
            } catch (JSONException ignored) {}
        }
        Collections.sort(result, (first, second) -> {
            int dateOrder = first.optString("date").compareTo(second.optString("date"));
            if (dateOrder != 0) return dateOrder;
            return first.optString("type").compareTo(second.optString("type"));
        });
        return result;
    }

    private static JSObject toJs(JSONObject source) {
        JSObject value = new JSObject();
        value.put("date", source.optString("date", ""));
        value.put("type", source.optString("type", ""));
        value.put("status", source.optString("status", ""));
        value.put("time", source.optString("time", ""));
        value.put("amount", source.optInt("amount", 0));
        value.put("reason", source.optString("reason", ""));
        return value;
    }

    public static synchronized JSObject getState(Context context) {
        reconcile(context);
        JSObject state = new JSObject();
        state.put("settings", settings(context));
        JSArray values = new JSArray();
        for (JSONObject value : records(context)) values.put(toJs(value));
        state.put("records", values);
        return state;
    }

    public static synchronized boolean processDeadline(Context context, String type) {
        initialize(context);
        String date = dateText(System.currentTimeMillis());
        boolean missing = readRecord(context, date, type) == null;
        reconcile(context);
        JSONObject value = readRecord(context, date, type);
        return missing && value != null && "failed".equals(value.optString("status"));
    }

    public static synchronized int[] monthMoney(Context context) {
        reconcile(context);
        String month = new SimpleDateFormat("yyyy-MM", KOREAN).format(new Date());
        int lost = 0;
        int earned = 0;
        for (JSONObject value : records(context)) {
            if (!value.optString("date").startsWith(month)) continue;
            if ("failed".equals(value.optString("status"))) lost += value.optInt("amount", 0);
            if ("gym".equals(value.optString("type")) && "credit".equals(value.optString("status"))) earned += value.optInt("amount", 0);
        }
        return new int[]{lost, earned};
    }

    public static String getCheckinTime(Context context) {
        initialize(context);
        return prefs(context).getString("checkinTime", "09:00");
    }

    public static String getCheckoutTime(Context context) {
        initialize(context);
        return prefs(context).getString("checkoutTime", "20:00");
    }
}
