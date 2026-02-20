package com.novafit.app;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/**
 * Native Android TTS plugin for Capacitor WebView.
 * Browser speechSynthesis is NOT available in WebView, so we use Android's TextToSpeech API.
 */
@CapacitorPlugin(name = "NativeTts")
public class TtsPlugin extends Plugin {

    private static final String TAG = "NativeTts";
    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                ttsReady = true;
                tts.setLanguage(Locale.US);
                tts.setSpeechRate(1.0f);
                tts.setPitch(1.0f);
                Log.d(TAG, "TTS engine ready");
            } else {
                Log.e(TAG, "TTS init failed: " + status);
            }
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String lang = call.getString("lang", "en");
        float rate = call.getFloat("rate", 1.0f);

        if (text.isEmpty()) {
            call.reject("No text provided");
            return;
        }

        if (!ttsReady || tts == null) {
            call.reject("TTS not ready");
            return;
        }

        // Set language
        Locale locale = lang.startsWith("pl") ? new Locale("pl", "PL") : Locale.US;
        tts.setLanguage(locale);
        tts.setSpeechRate(rate);

        String utteranceId = "novafit-" + System.currentTimeMillis();

        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) {
                Log.d(TAG, "Speaking started");
            }

            @Override
            public void onDone(String id) {
                Log.d(TAG, "Speaking done");
                JSObject result = new JSObject();
                result.put("done", true);
                call.resolve(result);
            }

            @Override
            public void onError(String id) {
                Log.e(TAG, "Speaking error");
                call.reject("TTS speaking error");
            }
        });

        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        if (result != TextToSpeech.SUCCESS) {
            call.reject("TTS speak failed: " + result);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) {
            tts.stop();
        }
        call.resolve();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", ttsReady);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
    }
}
