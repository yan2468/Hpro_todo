package com.davediver.tasks;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 小组件配置入口：让用户选择已创建的习惯绑定到桌面小组件。
 * 若未登录或无习惯，给出明确提示。
 */
public class HabitWidgetConfigureActivity extends Activity {
    private static final String TAG = "HabitWidgetConfig";
    private static final String PREFS = "DDWidgetAuth";
    private static final String PREFS_WIDGET = "DDHabitWidget";
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private ProgressBar loading;
    private TextView emptyView;
    private ListView listView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.habit_widget_configure);

        loading = findViewById(R.id.configure_loading);
        emptyView = findViewById(R.id.configure_empty);
        listView = findViewById(R.id.configure_list);

        Bundle extras = getIntent().getExtras();
        widgetId = extras != null
                ? extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
                : AppWidgetManager.INVALID_APPWIDGET_ID;

        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finishCancel();
            return;
        }

        SharedPreferences auth = getSharedPreferences(PREFS, MODE_PRIVATE);
        String token = auth.getString("token", "");
        String base = auth.getString("base", "");
        if (token.isEmpty() || base.isEmpty()) {
            toast("请先登录 App，再添加习惯小组件");
            finishCancel();
            return;
        }

        loadHabits(base, token);
    }

    private void loadHabits(String base, String token) {
        executor.execute(() -> {
            try {
                String url = base.replaceAll("/$", "") + "/habits";
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setRequestProperty("Accept", "application/json");

                int code = conn.getResponseCode();
                BufferedReader reader = new BufferedReader(new InputStreamReader(
                        code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream(),
                        StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();

                if (code < 200 || code >= 300) {
                    mainHandler.post(() -> {
                        toast("获取习惯列表失败：" + code);
                        finishCancel();
                    });
                    return;
                }

                JSONArray arr = new JSONArray(sb.toString());
                List<HabitItem> items = new ArrayList<>();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.optJSONObject(i);
                    if (o == null) continue;
                    items.add(new HabitItem(
                            o.optString("id", ""),
                            o.optString("title", "未命名习惯"),
                            o.optString("icon", "🔥"),
                            o.optString("color", "#f5a623")
                    ));
                }
                mainHandler.post(() -> showHabits(items));
            } catch (Exception e) {
                mainHandler.post(() -> {
                    toast("网络异常，请稍后重试");
                    finishCancel();
                });
            }
        });
    }

    private void showHabits(List<HabitItem> items) {
        loading.setVisibility(View.GONE);
        if (items.isEmpty()) {
            emptyView.setText("请先在 App 内创建习惯");
            emptyView.setVisibility(View.VISIBLE);
            listView.setVisibility(View.GONE);
            return;
        }

        SharedPreferences auth = getSharedPreferences(PREFS, MODE_PRIVATE);
        String token = auth.getString("token", "");
        String base = auth.getString("base", "");

        HabitAdapter adapter = new HabitAdapter(this, items);
        listView.setAdapter(adapter);
        listView.setVisibility(View.VISIBLE);
        listView.setOnItemClickListener((parent, view, position, id) -> {
            HabitItem item = items.get(position);
            saveAndBind(item, base, token);
        });
    }

    private void saveAndBind(HabitItem item, String base, String token) {
        loading.setVisibility(View.VISIBLE);
        listView.setVisibility(View.GONE);

        executor.execute(() -> {
            try {
                String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
                String url = base.replaceAll("/$", "") + "/habits/" + item.id + "/checkins?from=" + today + "&to=" + today;
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setRequestProperty("Accept", "application/json");

                int code = conn.getResponseCode();
                boolean checkedToday = false;
                if (code >= 200 && code < 300) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();
                    JSONArray arr = new JSONArray(sb.toString());
                    checkedToday = arr.length() > 0;
                }

                // 拉取该习惯的真实累计打卡天数，避免小组件初始“累计 0 天”且打卡计数错乱
                int total = 0;
                try {
                    String sUrl = base.replaceAll("/$", "") + "/habits/stats";
                    HttpURLConnection sConn = (HttpURLConnection) new URL(sUrl).openConnection();
                    sConn.setRequestMethod("GET");
                    sConn.setRequestProperty("Authorization", "Bearer " + token);
                    sConn.setRequestProperty("Accept", "application/json");
                    int sCode = sConn.getResponseCode();
                    if (sCode >= 200 && sCode < 300) {
                        BufferedReader sReader = new BufferedReader(
                                new InputStreamReader(sConn.getInputStream(), StandardCharsets.UTF_8));
                        StringBuilder sSb = new StringBuilder();
                        String sLine;
                        while ((sLine = sReader.readLine()) != null) sSb.append(sLine);
                        sReader.close();
                        JSONObject stats = new JSONObject(sSb.toString());
                        JSONObject hStat = stats.optJSONObject(item.id);
                        if (hStat != null) total = hStat.optInt("total", 0);
                    }
                    sConn.disconnect();
                } catch (Exception ignore) {
                    /* 统计获取失败则用 0，不影响绑定 */
                }

                SharedPreferences prefs = getSharedPreferences(PREFS_WIDGET, MODE_PRIVATE);
                prefs.edit()
                        .putString("habit_" + widgetId, item.id)
                        .putString("name_" + widgetId, item.title)
                        .putString("icon_" + widgetId, item.icon)
                        .putString("color_" + widgetId, item.color)
                        .putString("total_" + widgetId, String.valueOf(total))
                        .putBoolean("checked_" + widgetId, checkedToday)
                        .putString("last_date_" + widgetId, today)
                        .apply();

                HabitWidgetProvider.updateWidget(this, AppWidgetManager.getInstance(this), widgetId);

                mainHandler.post(() -> {
                    toast("已绑定「" + item.title + "」");
                    Intent result = new Intent();
                    result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
                    setResult(RESULT_OK, result);
                    finish();
                });
            } catch (Exception e) {
                mainHandler.post(() -> {
                    toast("绑定失败，请重试");
                    finishCancel();
                });
            }
        });
    }

    private void finishCancel() {
        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(RESULT_CANCELED, result);
        finish();
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    private static class HabitItem {
        final String id;
        final String title;
        final String icon;
        final String color;

        HabitItem(String id, String title, String icon, String color) {
            this.id = id;
            this.title = title;
            this.icon = icon;
            this.color = color;
        }
    }

    private static class HabitAdapter extends ArrayAdapter<HabitItem> {
        HabitAdapter(Context context, List<HabitItem> items) {
            super(context, 0, items);
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            HabitItem item = getItem(position);
            if (convertView == null) {
                convertView = LayoutInflater.from(getContext()).inflate(R.layout.habit_widget_configure_item, parent, false);
            }
            TextView icon = convertView.findViewById(R.id.item_icon);
            TextView name = convertView.findViewById(R.id.item_name);
            TextView sub = convertView.findViewById(R.id.item_sub);
            icon.setText(item.icon);
            name.setText(item.title);
            sub.setText("点击绑定到桌面小组件");
            return convertView;
        }
    }
}
