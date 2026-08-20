package com.mycommute.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.text.NumberFormat;
import java.util.Locale;

public final class NotificationHelper {
    private static final String CHANNEL_ID = "time_is_money_reminders";

    private NotificationHelper() {}

    public static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "시간과 돈 알림", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("출퇴근 마감과 월말 돈 기록을 알려드려요.");
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    public static void showMissed(Context context, String type) {
        String title = "checkin".equals(type) ? "출근 체크를 놓쳤어요" : "이제 정말 퇴근할 시간이에요";
        String text = "checkin".equals(type)
            ? "오늘 출근 QR 기록이 없어 잃은 돈에 기록했어요."
            : "퇴근 QR 기록이 없어 잃은 돈에 기록했어요. 지금은 집으로!";
        notify(context, "checkin".equals(type) ? 2101 : 2102, title, text);
    }

    public static void showMonthEnd(Context context, int lost, int earned) {
        String title = "이번 달 돈 기록이 도착했어요";
        String text = "잃은 돈 " + money(lost) + " · 번 돈 " + money(earned) + ". 잃은 돈만큼 기부할 시간이에요.";
        notify(context, 2103, title, text);
    }

    private static String money(int amount) {
        return NumberFormat.getNumberInstance(Locale.KOREA).format(amount) + "원";
    }

    private static void notify(Context context, int id, String title, String text) {
        createChannel(context);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_money_time)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        NotificationManagerCompat.from(context).notify(id, builder.build());
    }
}
