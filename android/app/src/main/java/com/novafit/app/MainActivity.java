package com.novafit.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthSensorsPlugin.class);
        registerPlugin(TtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
