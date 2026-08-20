package com.mycommute.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import java.util.Calendar;

public final class AlarmScheduler {
    public static final String ACTION_CHECKIN = "com.mycommute.app.CHECKIN_DEADLINE";
    public static final String ACTION_CHECKOUT = "com.mycommute.app.CHECKOUT_DEADLINE";
    public static final String ACTION_MONTH_END = "com.mycommute.app.MONTH_END";

    private AlarmScheduler() {}

    public static void scheduleAll(Context context) {
        scheduleDaily(context, ACTION_CHECKIN, CommuteStore.getCheckinTime(context), 1001);
        scheduleDaily(context, ACTION_CHECKOUT, CommuteStore.getCheckoutTime(context), 1002);
        scheduleMonthEnd(context);
    }

    private static void scheduleDaily(Context context, String action, String time, int requestCode) {
        String[] parts = time.split(":");
        int hour = Integer.parseInt(parts[0]);
        int minute = Integer.parseInt(parts[1]);
        Calendar trigger = Calendar.getInstance();
        trigger.set(Calendar.HOUR_OF_DAY, hour);
        trigger.set(Calendar.MINUTE, minute);
        trigger.set(Calendar.SECOND, 30);
        trigger.set(Calendar.MILLISECOND, 0);
        if (trigger.getTimeInMillis() <= System.currentTimeMillis()) trigger.add(Calendar.DAY_OF_MONTH, 1);
        set(context, trigger.getTimeInMillis(), pending(context, action, requestCode));
    }

    private static void scheduleMonthEnd(Context context) {
        String[] parts = CommuteStore.getCheckoutTime(context).split(":");
        int totalMinutes = Math.min(1439, (Integer.parseInt(parts[0]) * 60) + Integer.parseInt(parts[1]) + 10);
        Calendar trigger = Calendar.getInstance();
        trigger.set(Calendar.DAY_OF_MONTH, trigger.getActualMaximum(Calendar.DAY_OF_MONTH));
        trigger.set(Calendar.HOUR_OF_DAY, totalMinutes / 60);
        trigger.set(Calendar.MINUTE, totalMinutes % 60);
        trigger.set(Calendar.SECOND, 40);
        trigger.set(Calendar.MILLISECOND, 0);
        if (trigger.getTimeInMillis() <= System.currentTimeMillis()) {
            trigger.add(Calendar.MONTH, 1);
            trigger.set(Calendar.DAY_OF_MONTH, trigger.getActualMaximum(Calendar.DAY_OF_MONTH));
        }
        set(context, trigger.getTimeInMillis(), pending(context, ACTION_MONTH_END, 1003));
    }

    private static PendingIntent pending(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction(action);
        return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void set(Context context, long when, PendingIntent operation) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, operation);
    }
}
