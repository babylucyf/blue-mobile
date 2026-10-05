import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ugonwa.blue",
  appName: "Blue",
  webDir: "dist",
  android: {
    // Android 15 draws apps edge-to-edge; this keeps content clear of the status bar.
    adjustMarginsForEdgeToEdge: "force",
  },
};

export default config;
