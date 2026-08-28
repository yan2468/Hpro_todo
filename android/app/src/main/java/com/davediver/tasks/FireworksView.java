package com.davediver.tasks;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Handler;
import android.os.Looper;
import android.util.AttributeSet;
import android.view.View;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * 烟花/礼花粒子动画视图。
 * 从屏幕中心向上喷射彩色粒子，模拟庆祝效果。
 */
public class FireworksView extends View {
    private final Random random = new Random();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Particle> particles = new ArrayList<>();
    private final int[] colors = {
            0xFFF5A623, 0xFF34A06A, 0xFF4A90E2, 0xFFE94B3C,
            0xFF9B59B6, 0xFF1ABC9C, 0xFFF1C40F, 0xFFECF0F1
    };
    private long lastFrame = 0;
    private boolean running = true;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            updateParticles();
            invalidate();
            if (running) handler.postDelayed(this, 16);
        }
    };

    public FireworksView(Context context) {
        super(context);
        init();
    }

    public FireworksView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        setBackgroundColor(Color.TRANSPARENT);
        explode();
        handler.post(ticker);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float cx = getWidth() / 2f;
        float cy = getHeight() / 2f;
        for (Particle p : particles) {
            paint.setColor(p.color);
            paint.setAlpha((int) (255 * p.alpha));
            canvas.drawCircle(cx + p.x, cy + p.y, p.size, paint);
        }
    }

    private void explode() {
        int count = 90;
        for (int i = 0; i < count; i++) {
            float angle = random.nextFloat() * (float) (Math.PI * 2);
            float speed = 4f + random.nextFloat() * 10f;
            particles.add(new Particle(
                    (float) Math.cos(angle) * speed,
                    (float) Math.sin(angle) * speed,
                    colors[random.nextInt(colors.length)],
                    0.8f + random.nextFloat() * 0.2f,
                    3f + random.nextFloat() * 5f
            ));
        }
    }

    private void updateParticles() {
        long now = System.currentTimeMillis();
        float dt = lastFrame == 0 ? 16f : (now - lastFrame) / 1000f * 60f;
        lastFrame = now;

        for (int i = particles.size() - 1; i >= 0; i--) {
            Particle p = particles.get(i);
            p.x += p.vx * dt * 0.5f;
            p.y += p.vy * dt * 0.5f;
            p.vy += 0.25f * dt; // 重力
            p.alpha -= 0.012f * dt;
            p.size *= 0.985f;
            if (p.alpha <= 0) particles.remove(i);
        }

        if (particles.size() < 30 && random.nextFloat() < 0.15f) {
            explode();
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        running = false;
        handler.removeCallbacks(ticker);
        super.onDetachedFromWindow();
    }

    private static class Particle {
        float x = 0, y = 0;
        float vx, vy;
        int color;
        float alpha;
        float size;

        Particle(float vx, float vy, int color, float alpha, float size) {
            this.vx = vx;
            this.vy = vy;
            this.color = color;
            this.alpha = alpha;
            this.size = size;
        }
    }
}
