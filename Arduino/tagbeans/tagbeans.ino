// センサー連動起動機能強化版（タスク7対応）
const int SENSOR_PIN = 6;
int lastValue = 0;
unsigned long lastSendTime = 0;
unsigned long lastReleaseTime = 0;
const unsigned long COOLDOWN = 2000; // 2秒のクールダウン
const unsigned long RELEASE_DELAY = 1000; // 1秒の解除遅延

// 状態管理
bool sensorActive = false;
bool lastSensorState = false;

void setup() {
  pinMode(SENSOR_PIN, INPUT);
  Serial.begin(115200); // Processing側と同じボーレート
  Serial.println("Arduino sensor system enhanced - Task 7");
  Serial.println("SENSOR_DETECTED/SENSOR_RELEASED signals supported");
}

void loop() {
  int value = digitalRead(SENSOR_PIN);
  unsigned long currentTime = millis();
  
  // センサーがHIGHになった時（動き検知）
  if (value == HIGH && lastValue == LOW) {
    // クールダウン時間が経過している場合のみ送信
    if (currentTime - lastSendTime > COOLDOWN) {
      // 新しい信号形式と既存形式の両方を送信
      Serial.println("SENSOR_DETECTED"); // 新しい形式（タスク7）
      Serial.println("2"); // 既存形式（後方互換性）
      
      lastSendTime = currentTime;
      sensorActive = true;
      lastSensorState = true;
      
      // デバッグ情報
      Serial.print("Sensor activated at: ");
      Serial.println(currentTime);
    }
  }
  
  // センサーがLOWになった時（動き検知終了）
  else if (value == LOW && lastValue == HIGH) {
    // 解除遅延時間が経過している場合のみ送信
    if (currentTime - lastReleaseTime > RELEASE_DELAY) {
      Serial.println("SENSOR_RELEASED"); // センサー解除信号（タスク7）
      Serial.println("0"); // 既存形式（後方互換性）
      
      lastReleaseTime = currentTime;
      sensorActive = false;
      lastSensorState = false;
      
      // デバッグ情報
      Serial.print("Sensor released at: ");
      Serial.println(currentTime);
    }
  }
  
  // 定期的なハートビート（10秒ごと）
  static unsigned long lastHeartbeat = 0;
  if (currentTime - lastHeartbeat > 10000) {
    Serial.println("HEARTBEAT");
    lastHeartbeat = currentTime;
  }
  
  // エラー検出（センサーピンの状態チェック）
  static unsigned long lastErrorCheck = 0;
  if (currentTime - lastErrorCheck > 5000) {
    // センサーピンが正常に読み取れるかチェック
    int testRead = digitalRead(SENSOR_PIN);
    if (testRead != 0 && testRead != 1) {
      Serial.println("ERROR:SENSOR_FAIL");
    }
    lastErrorCheck = currentTime;
  }
  
  lastValue = value;
  delay(50); // 短い遅延
}
