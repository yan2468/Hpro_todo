package com.davediver.tasks;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.net.Uri;
import android.widget.RemoteViews;

import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 2×2 习惯打卡小组件，支持样式自定义（形状 / 圆角大小 / 背景照片）。
 */
public class HabitWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "DDWidgetAuth";
    static final String PREFS_WIDGET = "DDHabitWidget";
    static final String ACTION_CLICK = "com.davediver.tasks.HABIT_CLICK";
    static final String EXTRA_WIDGET_ID = "widgetId";
    static final String SHAPE_CIRCLE = "circle";
    static final String SHAPE_ROUNDED = "rounded";
    static final String SHAPE_SQUARE = "square";

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
        String habitName = prefs.getString("name_" + widgetId, "习惯打卡");
        String total = prefs.getString("total_" + widgetId, "0");
        String icon = prefs.getString("icon_" + widgetId, "🔥");
        String color = prefs.getString("color_" + widgetId, "#f5a623");
        boolean checkedToday = readCheckedToday(prefs, widgetId, editor);
        String shape = prefs.getString("shape_" + widgetId, SHAPE_CIRCLE);
        String bgImageUri = prefs.getString("bg_image_" + widgetId, "");
        editor.apply();

        views.setTextViewText(R.id.widget_habit_name, habitName);
        views.setTextViewText(R.id.widget_habit_total, "累计 " + total + " 天");
        views.setTextViewText(R.id.widget_habit_icon, icon);
        try {
            views.setTextColor(R.id.widget_habit_icon, Color.parseColor(color));
        } catch (Exception ignored) {
            views.setTextColor(R.id.widget_habit_icon, Color.parseColor("#f5a623"));
        }

        // 背景图片
        boolean hasBgImage = false;
        if (!bgImageUri.isEmpty()) {
            try {
                Bitmap bm = loadAndClipBitmap(context, Uri.parse(bgImageUri), shape);
                if (bm != null) {
                    views.setImageViewBitmap(R.id.widget_habit_bg_image, bm);
                    views.setViewVisibility(R.id.widget_habit_bg_image, android.view.View.VISIBLE);
                    views.setViewVisibility(R.id.widget_habit_overlay, android.view.View.VISIBLE);
                    views.setViewVisibility(R.id.widget_habit_bg, android.view.View.GONE);
                    hasBgImage = true;
                }
            } catch (Exception ignored) {}
        }
        if (!hasBgImage) {
            views.setViewVisibility(R.id.widget_habit_bg_image, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_habit_overlay, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_habit_bg, android.view.View.VISIBLE);
            boolean isRound = SHAPE_CIRCLE.equals(shape);
            if (checkedToday) {
                views.setImageViewResource(R.id.widget_habit_bg,
                        isRound ? R.drawable.widget_bg_checked : R.drawable.widget_bg_rounded_checked);
            } else {
                views.setImageViewResource(R.id.widget_habit_bg,
                        isRound ? R.drawable.widget_bg_unchecked : R.drawable.widget_bg_rounded);
            }
        }

        if (hasBgImage || checkedToday) {
            views.setTextColor(R.id.widget_habit_name, 0xFFFFFFFF);
            views.setTextColor(R.id.widget_habit_total, 0xFFD9F5E3);
            views.setViewVisibility(R.id.widget_habit_check,
                    checkedToday ? android.view.View.VISIBLE : android.view.View.GONE);
        } else {
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

    /** 加载图片并按形状裁剪 */
    private static Bitmap loadAndClipBitmap(Context context, Uri uri, String shape) {
        try {
            InputStream is = context.getContentResolver().openInputStream(uri);
            if (is == null) return null;
            Bitmap src = BitmapFactory.decodeStream(is);
            is.close();
            if (src == null) return null;
            int size = Math.min(src.getWidth(), src.getHeight());
            Bitmap sq = Bitmap.createBitmap(src, (src.getWidth() - size) / 2, (src.getHeight() - size) / 2, size, size);
            int t = 256;
            Bitmap scaled = Bitmap.createScaledBitmap(sq, t, t, true);
            Bitmap out = Bitmap.createBitmap(t, t, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(out);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            Path path = new Path();
            if (SHAPE_CIRCLE.equals(shape)) {
                path.addCircle(t / 2f, t / 2f, t / 2f, Path.Direction.CW);
            } else if (SHAPE_SQUARE.equals(shape)) {
                path.addRect(0, 0, t, t, Path.Direction.CW);
            } else {
                float cr = 40f; // 圆角像素
                path.addRoundRect(new RectF(0, 0, t, t), cr, cr, Path.Direction.CW);
            }
            c.clipPath(path);
            c.drawBitmap(scaled, 0, 0, p);
            return out;
        } catch (Exception e) {
            return null;
        }
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
