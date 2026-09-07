import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.lemgil.lemwriter',
  appName: 'LemWriter',
  webDir: 'dist',
  plugins: {
    SpeechRecognition: {}
  }
}

export default config
