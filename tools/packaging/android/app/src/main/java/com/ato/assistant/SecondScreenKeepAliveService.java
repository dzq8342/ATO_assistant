package com.ato.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * 私人版：平板锁屏后第二屏照常可用。
 *
 * 第二屏的局域网服务（LocalSecondScreenServer）跑在 App 进程里。锁屏后安卓会让后台 App
 * 休眠：CPU 停下、Wi-Fi 进入省电，别的设备就连不上了。这个前台服务在第二屏开着时常驻
 * 通知栏（「第二屏运行中」），并持有 CPU 唤醒锁和 Wi-Fi 锁，让局域网服务在锁屏时继续响应。
 * 第二屏关闭（或 App 退出）时一起停掉，锁也随之释放。
 *
 * 省电：连续 30 分钟没有任何设备请求第二屏时，自动停掉这个服务、放掉锁（第二屏本身仍开着）；
 * 之后再有设备连上，或回到 App 时，再自动恢复。
 */
public final class SecondScreenKeepAliveService extends Service {
  private static final String CHANNEL_ID = "ato-second-screen";
  private static final int NOTIFICATION_ID = 37403;
  private static final String LOCK_TAG = "ato:second-screen";
  private static final long IDLE_LIMIT_MS = 30L * 60L * 1000L;
  private static final long IDLE_CHECK_MS = 60L * 1000L;

  private static volatile long lastRequestAt = SystemClock.elapsedRealtime();
  private static volatile boolean running = false;
  private static volatile boolean idleStopped = false;

  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Runnable idleCheck = new Runnable() {
    @Override public void run() {
      if (SystemClock.elapsedRealtime() - lastRequestAt >= IDLE_LIMIT_MS) {
        idleStopped = true;
        stopSelf();
        return;
      }
      handler.postDelayed(this, IDLE_CHECK_MS);
    }
  };

  // 有设备请求第二屏时调用：记时间；如果之前因为没人连而停了保持唤醒，就重新开起来。
  static void noteRequest(Context context) {
    lastRequestAt = SystemClock.elapsedRealtime();
    // App 在后台时系统不让新开前台服务，开不起来就保持「已停」，下一次请求或回到 App 时再试。
    if (idleStopped && !running && start(context)) idleStopped = false;
  }

  private PowerManager.WakeLock wakeLock;
  private WifiManager.WifiLock wifiLock;

  static boolean start(Context context) {
    lastRequestAt = SystemClock.elapsedRealtime();
    Context app = context.getApplicationContext();
    Intent intent = new Intent(app, SecondScreenKeepAliveService.class);
    try {
      if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(intent);
      else app.startService(intent);
      return true;
    } catch (RuntimeException notAllowed) {
      // App 在后台时系统不允许新开前台服务（例如锁屏时别的设备请求开启第二屏）。
      // 局域网服务本身已经开了，只是锁屏后可能会断；下次回到 App 时再补上。
      return false;
    }
  }

  static void stop(Context context) {
    idleStopped = false;
    Context app = context.getApplicationContext();
    try {
      app.stopService(new Intent(app, SecondScreenKeepAliveService.class));
    } catch (RuntimeException ignored) {
      // 服务没在跑时无事可做。
    }
  }

  @Override public IBinder onBind(Intent intent) {
    return null;
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    Notification notification = buildNotification();
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
      } else {
        startForeground(NOTIFICATION_ID, notification);
      }
    } catch (RuntimeException error) {
      stopSelf();
      return START_NOT_STICKY;
    }
    acquireLocks();
    running = true;
    handler.removeCallbacks(idleCheck);
    handler.postDelayed(idleCheck, IDLE_CHECK_MS);
    return START_NOT_STICKY;
  }

  @Override public void onDestroy() {
    running = false;
    handler.removeCallbacks(idleCheck);
    releaseLocks();
    super.onDestroy();
  }

  private void acquireLocks() {
    try {
      if (wakeLock == null) {
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (power != null) {
          wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, LOCK_TAG);
          wakeLock.setReferenceCounted(false);
        }
      }
      if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
    } catch (RuntimeException ignored) {
      // 拿不到唤醒锁时第二屏照常工作，只是锁屏后可能会断。
    }
    try {
      if (wifiLock == null) {
        WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
          @SuppressWarnings("deprecation")
          int mode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
          wifiLock = wifi.createWifiLock(mode, LOCK_TAG);
          wifiLock.setReferenceCounted(false);
        }
      }
      if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
    } catch (RuntimeException ignored) {
      // 同上。
    }
  }

  private void releaseLocks() {
    try {
      if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    } catch (RuntimeException ignored) {
      // ignore
    }
    try {
      if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    } catch (RuntimeException ignored) {
      // ignore
    }
    wifiLock = null;
    wakeLock = null;
  }

  private Notification buildNotification() {
    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent content = PendingIntent.getActivity(this, 0, open,
        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    Notification.Builder builder;
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "第二屏", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("第二屏开着时常驻，锁屏后第二屏仍可使用。");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
      }
      builder = new Notification.Builder(this, CHANNEL_ID);
    } else {
      builder = new Notification.Builder(this);
    }
    return builder
        .setSmallIcon(android.R.drawable.ic_menu_share)
        .setContentTitle("第二屏运行中")
        .setContentText("锁屏后第二屏仍可使用；30 分钟没有设备连接会自动停止，以节省电量。")
        .setContentIntent(content)
        .setOngoing(true)
        .setShowWhen(false)
        .build();
  }
}
