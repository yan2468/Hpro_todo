package com.davediver.tasks;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 处理小组件点击：当日已打卡则取消，未打卡则打卡。
 * 通过原生 SharedPreferences 中的 token 调用后端接口。
 * 打卡成功后启动烟花庆祝动画。
 */
public class HabitWidgetClickReceiver extends BroadcastReceiver {
    private static final String TAG = "HabitWidgetClick";
    private static final String PREFS = "DDWidgetAuth";
    private static final String PREFS_WIDGET = "DDHabitWidget";
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onReceive(Context context, Intent intent) {
        int widgetId = intent.getIntExtra(HabitWidgetProvider.EXTRA_WIDGET_ID, -1);
        if (widgetId < 0) return;

        SharedPreferences widgetPrefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);
        String habitId = widgetPrefs.getString("habit_" + widgetId, "");
        if (habitId.isEmpty()) {
            toast(context, "请先配置小组件");
            return;
        }

        SharedPreferences authPrefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = authPrefs.getString("token", "");
        String base = authPrefs.getString("base", "");
        if (token.isEmpty() || base.isEmpty()) {
            toast(context, "请先登录 App");
            return;
        }

        final String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
        // 用本地记录判定本次是「打卡」还是「取消」：当天已打卡则取消，否则打卡。
        // 后端 /habits/:id/checkin 为幂等写入，/habits/:id/checkin/:date 为删除，
        // 两者在线上服务器均已存在，无需改动后端即可工作。
        boolean checkedToday = widgetPrefs.getBoolean("checked_" + widgetId, false);
        String lastDate = widgetPrefs.getString("last_date_" + widgetId, "");
        if (!today.equals(lastDate)) {
            // 跨天自动重置为未打卡
            checkedToday = false;
            widgetPrefs.edit().putString("last_date_" + widgetId, today)
                    .putBoolean("checked_" + widgetId, false).apply();
        }
        final boolean willCheckIn = !checkedToday;

        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                String urlBase = base.replaceAll("/$", "");
                String endpoint = urlBase + "/habits/" + habitId
                        + (willCheckIn ? "/checkin" : "/checkin/" + today);
                conn = (HttpURLConnection) new URL(endpoint).openConnection();
                conn.setRequestMethod(willCheckIn ? "POST" : "DELETE");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setRequestProperty("Accept", "application/json");
                conn.setUseCaches(false);
                // 两个分支都显式声明 Content-Type: application/json 并发送非空 JSON body：
                // - POST /checkin 需要 {"checkDate": today}；
                // - DELETE /checkin/:date 服务端忽略 body，但 Android HttpURLConnection 在某些
                //   版本/网络环境下会为 DELETE 自动附加 application/x-www-form-urlencoded 等
                //   Fastify 未注册的 Content-Type，导致 415 FST_ERR_CTP_INVALID_MEDIA_TYPE；
                //   显式覆盖为 application/json 并发送非空 body 可同时规避
                //   415 FST_ERR_CTP_INVALID_MEDIA_TYPE 和 400 FST_ERR_CTP_EMPTY_JSON_BODY。
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                JSONObject body = new JSONObject();
                if (willCheckIn) {
                    body.put("checkDate", today);
                } else {
                    // 取消打卡：任意非空 JSON 对象即可，服务端忽略 body
                    body.put("date", today);
                }
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }

                int code = conn.getResponseCode();
                String response = readStream(conn, code);

                if (code >= 200 && code < 300) {
                    JSONObject resp = new JSONObject(response);
                    boolean nowChecked = resp.optBoolean("checked", willCheckIn);
                    int total = resp.optInt("total", -1);

                    SharedPreferences.Editor editor = widgetPrefs.edit();
                    editor.putBoolean("checked_" + widgetId, nowChecked);
                    editor.putString("last_date_" + widgetId, today);
                    if (total >= 0) editor.putString("total_" + widgetId, String.valueOf(total));
                    editor.apply();

                    HabitWidgetProvider.refreshAll(context);
                    toast(context, nowChecked ? "打卡成功" : "已取消打卡");
                    if (nowChecked) {
                        launchCelebrate(context, widgetPrefs, widgetId);
                    }
                } else {
                    toast(context, "打卡失败：" + code + " " + response);
                    Log.w(TAG, "checkin failed " + code + " " + response);
                }
            } catch (Exception e) {
                Log.e(TAG, "checkin error", e);
                toast(context, "网络异常，请稍后重试");
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private String readStream(HttpURLConnection conn, int code) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(
                code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream(),
                StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        return sb.toString();
    }

    private void launchCelebrate(Context context, SharedPreferences widgetPrefs, int widgetId) {
        try {
            String name = widgetPrefs.getString("name_" + widgetId, "习惯打卡");
            Intent intent = new Intent(context, HabitWidgetCelebrateActivity.class);
            intent.putExtra(HabitWidgetCelebrateActivity.EXTRA_HABIT_NAME, name);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "launch celebrate failed", e);
        }
    }

    private void toast(Context context, String msg) {
        mainHandler.post(() -> Toast.makeText(context, msg, Toast.LENGTH_SHORT).show());
    }
}
