package com.davediver.tasks;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

/**
 * 把登录后的 token / base URL 落地到原生 SharedPreferences，
 * 供桌面小组件直接读取并发起 HTTP 请求。
 * 同时提供 syncHabitWidget：App 内打卡后把最新状态推送到桌面小组件，实现双向同步。
 */
@CapacitorPlugin(name = "AuthBridge")
public class AuthBridgePlugin extends Plugin {
    private static final String PREFS = "DDWidgetAuth";
    private static final String PREFS_WIDGET = "DDHabitWidget";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_BASE = "base";

    @PluginMethod
    public void setAuth(PluginCall call) {
        String token = call.getString("token", "");
        String base = call.getString("base", "");
        SharedPreferences.Editor editor = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editor.putString(KEY_TOKEN, token);
        editor.putString(KEY_BASE, base);
        editor.apply();
        call.resolve();
    }

    @PluginMethod
    public void clearAuth(PluginCall call) {
        SharedPreferences.Editor editor = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editor.clear();
        editor.apply();
        call.resolve();
    }

    /**
     * App 内打卡/取消后，把最新状态推送到绑定了该习惯的桌面小组件。
     * 扫描 DDHabitWidget 中所有 habit_<id> 键，匹配 habitId 后更新 checked_/total_/last_date_ 并刷新组件。
     */
    @PluginMethod
    public void syncHabitWidget(PluginCall call) {
        String habitId = call.getString("habitId", "");
        boolean checked = call.getBoolean("checked", false);
        int total = call.getInt("total", -1);
        String date = call.getString("date", todayStr());
        if (habitId.isEmpty()) {
            call.resolve();
            return;
        }
        SharedPreferences widgets = getContext().getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = widgets.edit();
        for (String key : widgets.getAll().keySet()) {
            if (key.startsWith("habit_")) {
                String bound = widgets.getString(key, "");
                if (habitId.equals(bound)) {
                    String wid = key.substring("habit_".length());
                    ed.putBoolean("checked_" + wid, checked);
                    ed.putString("last_date_" + wid, date);
                    if (total >= 0) ed.putString("total_" + wid, String.valueOf(total));
                }
            }
        }
        ed.apply();
        HabitWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    private static String todayStr() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
    }
}
