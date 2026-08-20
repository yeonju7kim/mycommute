package com.mycommute.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : intent.getAction();
        if (AlarmScheduler.ACTION_CHECKIN.equals(action)) {
            if (CommuteStore.processDeadline(context, "checkin")) NotificationHelper.showMissed(context, "checkin");
        } else if (AlarmScheduler.ACTION_CHECKOUT.equals(action)) {
            if (CommuteStore.processDeadline(context, "checkout")) NotificationHelper.showMissed(context, "checkout");
        } else if (AlarmScheduler.ACTION_MONTH_END.equals(action)) {
            int[] money = CommuteStore.monthMoney(context);
            NotificationHelper.showMonthEnd(context, money[0], money[1]);
        }
        AlarmScheduler.scheduleAll(context);
    }
}
