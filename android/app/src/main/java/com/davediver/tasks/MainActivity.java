package com.davediver.tasks;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuthBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
