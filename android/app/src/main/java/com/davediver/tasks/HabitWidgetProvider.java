package com.davediver.tasks;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 2×2 圆形习惯打卡小组件。
 * 点击组件整体触发 HabitWidgetClickReceiver 进行当日打卡/取消打卡。
 */
public class HabitWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "DDWidgetAuth";
    static final String PREFS_WIDGET = "DDHabitWidget";
    static final String ACTION_CLICK = "com.davediver.tasks.HABIT_CLICK";
    static final String EXTRA_WIDGET_ID = "widgetId";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int widgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId);
        }
    }

    /** 判断是否「今日已打卡」：必须同时满足 本地标记已打卡 且 最近一次打卡日期 == 今天。
     *  跨天未打卡时自动重置为未打卡（白底），保证第 1/2/…/n 天在没打卡时都显示未打卡状态，
     *  只有真正点击打卡当天才变蓝。该方法会顺手把过期的本地状态写回，避免反复重置。 */
    static boolean readCheckedToday(SharedPreferences prefs, int widgetId, SharedPreferences.Editor editor) {
        String today = todayStr();
        boolean checked = prefs.getBoolean("checked_" + widgetId, false);
        String lastDate = prefs.getString("last_date_" + widgetId, "");
        if (!today.equals(lastDate)) {
            checked = false;
            editor.putBoolean("checked_" + widgetId, false);
            editor.putString("last_date_" + widgetId, today);
        }
        return checked;
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_habit);

        SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        String habitId = prefs.getString("habit_" + widgetId, "");
        String habitName = prefs.getString("name_" + widgetId, "习惯打卡");
        String total = prefs.getString("total_" + widgetId, "0");
        String icon = prefs.getString("icon_" + widgetId, "🔥");
        String color = prefs.getString("color_" + widgetId, "#f5a623");
        boolean checkedToday = readCheckedToday(prefs, widgetId, editor);
        editor.apply();

        views.setTextViewText(R.id.widget_habit_name, habitName);
        views.setTextViewText(R.id.widget_habit_total, "累计 " + total + " 天");
        views.setTextViewText(R.id.widget_habit_icon, icon);
        try {
            views.setTextColor(R.id.widget_habit_icon, Color.parseColor(color));
        } catch (Exception ignored) {
            views.setTextColor(R.id.widget_habit_icon, Color.parseColor("#f5a623"));
        }

        if (checkedToday) {
            views.setImageViewResource(R.id.widget_habit_bg, R.drawable.widget_bg_checked);
            views.setTextColor(R.id.widget_habit_name, 0xFFFFFFFF);
            views.setTextColor(R.id.widget_habit_total, 0xFFD9F5E3);
            views.setViewVisibility(R.id.widget_habit_check, android.view.View.VISIBLE);
        } else {
            views.setImageViewResource(R.id.widget_habit_bg, R.drawable.widget_bg_unchecked);
            views.setTextColor(R.id.widget_habit_name, 0xFF21362C);
            views.setTextColor(R.id.widget_habit_total, 0xFF5D736A);
            views.setViewVisibility(R.id.widget_habit_check, android.view.View.GONE);
        }

        Intent clickIntent = new Intent(context, HabitWidgetClickReceiver.class);
        clickIntent.setAction(ACTION_CLICK);
        clickIntent.putExtra(EXTRA_WIDGET_ID, widgetId);
        PendingIntent pending = PendingIntent.getBroadcast(
                context, widgetId, clickIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_habit_root, pending);

        manager.updateAppWidget(widgetId, views);
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, HabitWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(provider);
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
    }

    private static String todayStr() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
    }
}
