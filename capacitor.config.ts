import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.novafit.app",
  appName: "NovaFit",
  // Load from deployed Vercel URL — keeps all API routes working
  server: {
    url: "https://novafit-rho.vercel.app",
    cleartext: false,
  },
  android: {
    // Allow mixed content for dev
    allowMixedContent: false,
    // Use Chrome WebView for best compatibility
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#ecfdf5",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT", // Dark icons on light background
      backgroundColor: "#ecfdf5",
      overlaysWebView: false,
    },
  },
};

export default config;
