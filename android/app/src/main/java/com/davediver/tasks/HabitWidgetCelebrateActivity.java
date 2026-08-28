package com.davediver.tasks;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * 打卡成功后显示的烟花/礼花庆祝动画。
 * 透明背景、点击或 2.2 秒后自动消失。
 */
public class HabitWidgetCelebrateActivity extends Activity {
    static final String EXTRA_HABIT_NAME = "habit_name";
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(Color.TRANSPARENT);

        FireworksView fireworks = new FireworksView(this);
        root.addView(fireworks, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        String habitName = getIntent().getStringExtra(EXTRA_HABIT_NAME);
        if (habitName == null) habitName = "习惯打卡";

        TextView label = new TextView(this);
        label.setText("「" + habitName + "」打卡成功！");
        label.setTextSize(20f);
        label.setTextColor(Color.WHITE);
        label.setShadowLayer(6f, 0f, 2f, Color.BLACK);
        label.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = android.view.Gravity.CENTER_HORIZONTAL | android.view.Gravity.TOP;
        lp.topMargin = 160;
        root.addView(label, lp);

        setContentView(root);

        root.setOnClickListener(v -> finish());

        handler.postDelayed(this::finish, 2200);
    }

    @Override
    protected void onPause() {
        super.onPause();
        finish();
    }
}
