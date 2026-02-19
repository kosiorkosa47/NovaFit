package com.novafit.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;
import java.util.List;

/**
 * Native Android sensor plugin for health data.
 * Reads step counter, heart rate, and accelerometer from phone hardware.
 * This is the native backend — the UI is the web app (unchanged).
 */
@CapacitorPlugin(
    name = "HealthSensors",
    permissions = {
        @Permission(strings = {"android.permission.ACTIVITY_RECOGNITION"}, alias = "activity"),
        @Permission(strings = {"android.permission.BODY_SENSORS"}, alias = "body")
    }
)
public class HealthSensorsPlugin extends Plugin implements SensorEventListener {

    private SensorManager sensorManager;
    private Sensor stepCounterSensor;
    private Sensor heartRateSensor;
    private Sensor accelerometerSensor;

    private int totalSteps = 0;
    private int initialSteps = -1;
    private float lastHeartRate = -1;
    private boolean isTracking = false;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        heartRateSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE);
        accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
    }

    @PluginMethod()
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        List<String> sensors = new ArrayList<>();

        if (stepCounterSensor != null) sensors.add("step-counter");
        if (heartRateSensor != null) sensors.add("heart-rate");
        if (accelerometerSensor != null) sensors.add("accelerometer");

        // Check for Health Connect
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
        call.resolve(result);
    }

    @PluginMethod()
    public void startStepCounting(PluginCall call) {
        if (stepCounterSensor != null) {
            sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_NORMAL);
            isTracking = true;
            call.resolve();
        } else if (accelerometerSensor != null) {
            // Fallback: use accelerometer for step estimation
            sensorManager.registerListener(this, accelerometerSensor, SensorManager.SENSOR_DELAY_GAME);
            isTracking = true;
            call.resolve();
        } else {
            call.reject("No step counter or accelerometer available");
        }
    }

    @PluginMethod()
    public void stopStepCounting(PluginCall call) {
        sensorManager.unregisterListener(this);
        isTracking = false;
        call.resolve();
    }

    @PluginMethod()
    public void getSteps(PluginCall call) {
        JSObject result = new JSObject();
        result.put("steps", totalSteps);
        result.put("isTracking", isTracking);
        call.resolve(result);
    }

    @PluginMethod()
    public void getHeartRate(PluginCall call) {
        if (heartRateSensor != null && !isTracking) {
            // Register briefly to get a reading
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
        JSObject result = new JSObject();
        result.put("steps", totalSteps);
        result.put("heartRate", lastHeartRate > 0 ? Math.round(lastHeartRate) : JSObject.NULL);
        result.put("calories", Math.round(totalSteps * 0.04));
        result.put("distance", Math.round(totalSteps * 0.762));
        result.put("sleep", 7); // Cannot measure from sensors alone
        result.put("stress", 35); // Placeholder
        result.put("lastUpdated", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date()));
        result.put("source", stepCounterSensor != null ? "android-sensors" : "mock");
        call.resolve(result);
    }

    // --- Accelerometer-based step detection ---
    private float lastMagnitude = 0;
    private static final float STEP_THRESHOLD = 12.0f;
    private long lastStepTime = 0;
    private static final long MIN_STEP_INTERVAL = 250; // ms between steps

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            int rawSteps = (int) event.values[0];
            if (initialSteps < 0) {
                initialSteps = rawSteps;
            }
            totalSteps = rawSteps - initialSteps;

            // Notify web layer
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
            // Fallback step detection from accelerometer
            float x = event.values[0], y = event.values[1], z = event.values[2];
            float magnitude = (float) Math.sqrt(x * x + y * y + z * z);

            long now = System.currentTimeMillis();
            if (magnitude > STEP_THRESHOLD && lastMagnitude <= STEP_THRESHOLD
                && (now - lastStepTime) > MIN_STEP_INTERVAL) {
                totalSteps++;
                lastStepTime = now;

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
