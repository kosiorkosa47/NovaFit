package com.novafit.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Native Android sensor plugin for health data.
 * Reads step counter, heart rate, and accelerometer from phone hardware.
 * Persists daily step counts across app restarts via SharedPreferences.
 */
@CapacitorPlugin(
    name = "HealthSensors",
    permissions = {
        @Permission(strings = {"android.permission.ACTIVITY_RECOGNITION"}, alias = "activity"),
        @Permission(strings = {"android.permission.BODY_SENSORS"}, alias = "body")
    }
)
public class HealthSensorsPlugin extends Plugin implements SensorEventListener {

    private static final String TAG = "HealthSensors";
    private static final String PREFS_NAME = "novafit_health_prefs";
    private static final String KEY_DAILY_STEPS = "daily_steps";
    private static final String KEY_STEP_DATE = "step_date";
    private static final String KEY_BOOT_BASELINE = "boot_baseline";

    private SensorManager sensorManager;
    private Sensor stepCounterSensor;
    private Sensor heartRateSensor;
    private Sensor accelerometerSensor;

    private int totalSteps = 0;
    private int initialSteps = -1;
    private int persistedDailySteps = 0;
    private float lastHeartRate = -1;
    private boolean isTracking = false;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        heartRateSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE);
        accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        // Load persisted daily steps
        loadPersistedSteps();

        // Auto-start step counting if permission already granted
        if (hasActivityPermission()) {
            autoStartTracking();
        }

        Log.i(TAG, "Plugin loaded. Step sensor: " + (stepCounterSensor != null) +
               ", HR sensor: " + (heartRateSensor != null) +
               ", Persisted steps: " + persistedDailySteps);
    }

    private boolean hasActivityPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return ContextCompat.checkSelfPermission(getContext(),
            Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    private void autoStartTracking() {
        if (isTracking) return;
        if (stepCounterSensor != null) {
            sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_NORMAL);
            isTracking = true;
            Log.i(TAG, "Auto-started step counter sensor");
        } else if (accelerometerSensor != null) {
            sensorManager.registerListener(this, accelerometerSensor, SensorManager.SENSOR_DELAY_GAME);
            isTracking = true;
            Log.i(TAG, "Auto-started accelerometer fallback");
        }
    }

    private String getTodayKey() {
        Calendar cal = Calendar.getInstance();
        return cal.get(Calendar.YEAR) + "-" +
               String.format("%02d", cal.get(Calendar.MONTH) + 1) + "-" +
               String.format("%02d", cal.get(Calendar.DAY_OF_MONTH));
    }

    private void loadPersistedSteps() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String savedDate = prefs.getString(KEY_STEP_DATE, "");
        String today = getTodayKey();

        if (today.equals(savedDate)) {
            persistedDailySteps = prefs.getInt(KEY_DAILY_STEPS, 0);
            totalSteps = persistedDailySteps;
            Log.i(TAG, "Loaded persisted steps for today: " + persistedDailySteps);
        } else {
            // New day — reset
            persistedDailySteps = 0;
            totalSteps = 0;
            initialSteps = -1;
            prefs.edit()
                .putString(KEY_STEP_DATE, today)
                .putInt(KEY_DAILY_STEPS, 0)
                .putInt(KEY_BOOT_BASELINE, -1)
                .apply();
            Log.i(TAG, "New day detected, reset step count");
        }
    }

    private void persistSteps() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString(KEY_STEP_DATE, getTodayKey())
            .putInt(KEY_DAILY_STEPS, totalSteps)
            .putInt(KEY_BOOT_BASELINE, initialSteps)
            .apply();
    }

    @PluginMethod()
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        List<String> sensors = new ArrayList<>();

        if (stepCounterSensor != null) sensors.add("step-counter");
        if (heartRateSensor != null) sensors.add("heart-rate");
        if (accelerometerSensor != null) sensors.add("accelerometer");

        try {
            getContext().getPackageManager().getPackageInfo("com.google.android.apps.healthdata", 0);
            sensors.add("health-connect");
        } catch (Exception e) {
            // Health Connect not installed
        }

        result.put("available", !sensors.isEmpty());
        JSArray sensorArray = new JSArray();
        for (String s : sensors) sensorArray.put(s);
        result.put("sensors", sensorArray);
        result.put("permissionGranted", hasActivityPermission());
        call.resolve(result);
    }

    @PluginMethod()
    public void startStepCounting(PluginCall call) {
        // Request permission if needed
        if (!hasActivityPermission()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getActivity() != null) {
                ActivityCompat.requestPermissions(getActivity(),
                    new String[]{Manifest.permission.ACTIVITY_RECOGNITION}, 1001);
            }
            // Still try to start — some devices work without explicit grant
        }

        if (stepCounterSensor != null) {
            sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_NORMAL);
            isTracking = true;
            Log.i(TAG, "Started step counter sensor");
            call.resolve();
        } else if (accelerometerSensor != null) {
            sensorManager.registerListener(this, accelerometerSensor, SensorManager.SENSOR_DELAY_GAME);
            isTracking = true;
            Log.i(TAG, "Started accelerometer fallback for steps");
            call.resolve();
        } else {
            call.reject("No step counter or accelerometer available");
        }
    }

    @PluginMethod()
    public void stopStepCounting(PluginCall call) {
        sensorManager.unregisterListener(this);
        isTracking = false;
        persistSteps();
        call.resolve();
    }

    @PluginMethod()
    public void getSteps(PluginCall call) {
        JSObject result = new JSObject();
        result.put("steps", totalSteps);
        result.put("isTracking", isTracking);
        result.put("permissionGranted", hasActivityPermission());
        call.resolve(result);
    }

    @PluginMethod()
    public void getHeartRate(PluginCall call) {
        if (heartRateSensor != null && !isTracking) {
            sensorManager.registerListener(this, heartRateSensor, SensorManager.SENSOR_DELAY_NORMAL);
        }

        JSObject result = new JSObject();
        if (lastHeartRate > 0) {
            result.put("bpm", Math.round(lastHeartRate));
        } else {
            result.put("bpm", JSObject.NULL);
        }
        call.resolve(result);
    }

    @PluginMethod()
    public void getHealthData(PluginCall call) {
        // If not tracking yet, try to auto-start
        if (!isTracking && hasActivityPermission()) {
            autoStartTracking();
        }

        JSObject result = new JSObject();
        result.put("steps", totalSteps);
        result.put("heartRate", lastHeartRate > 0 ? Math.round(lastHeartRate) : JSObject.NULL);
        result.put("calories", Math.round(totalSteps * 0.04));
        result.put("distance", Math.round(totalSteps * 0.762));
        result.put("sleep", 7); // Cannot measure from sensors alone
        result.put("stress", 35); // Placeholder
        result.put("lastUpdated", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date()));
        result.put("source", (stepCounterSensor != null || accelerometerSensor != null) ? "android-sensors" : "mock");
        result.put("isTracking", isTracking);
        call.resolve(result);
    }

    // --- Accelerometer-based step detection ---
    private float lastMagnitude = 0;
    private static final float STEP_THRESHOLD = 12.0f;
    private long lastStepTime = 0;
    private static final long MIN_STEP_INTERVAL = 250;

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            int rawSteps = (int) event.values[0];

            // Load boot baseline from prefs if this is a fresh session
            if (initialSteps < 0) {
                SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                int savedBaseline = prefs.getInt(KEY_BOOT_BASELINE, -1);
                String savedDate = prefs.getString(KEY_STEP_DATE, "");

                if (getTodayKey().equals(savedDate) && savedBaseline >= 0) {
                    // Same day, same boot cycle — restore baseline
                    initialSteps = savedBaseline;
                    Log.i(TAG, "Restored boot baseline: " + savedBaseline + ", raw: " + rawSteps);
                } else {
                    // New day or first run — set baseline now
                    initialSteps = rawSteps;
                    Log.i(TAG, "Set new boot baseline: " + rawSteps);
                }
            }

            int sessionSteps = rawSteps - initialSteps;
            // Add any previously persisted steps from earlier in the day (different app sessions)
            totalSteps = Math.max(sessionSteps, persistedDailySteps);
            // If we surpassed persisted count, this is the new total
            if (sessionSteps > persistedDailySteps) {
                totalSteps = sessionSteps;
            }

            persistSteps();

            JSObject data = new JSObject();
            data.put("steps", totalSteps);
            notifyListeners("stepUpdate", data);
        }
        else if (event.sensor.getType() == Sensor.TYPE_HEART_RATE) {
            if (event.values[0] > 0) {
                lastHeartRate = event.values[0];
                JSObject data = new JSObject();
                data.put("bpm", Math.round(lastHeartRate));
                notifyListeners("heartRateUpdate", data);
            }
        }
        else if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            float x = event.values[0], y = event.values[1], z = event.values[2];
            float magnitude = (float) Math.sqrt(x * x + y * y + z * z);

            long now = System.currentTimeMillis();
            if (magnitude > STEP_THRESHOLD && lastMagnitude <= STEP_THRESHOLD
                && (now - lastStepTime) > MIN_STEP_INTERVAL) {
                totalSteps++;
                lastStepTime = now;
                persistSteps();

                JSObject data = new JSObject();
                data.put("steps", totalSteps);
                notifyListeners("stepUpdate", data);
            }
            lastMagnitude = magnitude;
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Not needed
    }
}
