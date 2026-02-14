# akebono-pharmacy

## 起動方法

このプロジェクトは Electron アプリです。起動手順は **Windows / macOS 共通** です。

### 共通手順（Windows / macOS）
1. 依存関係をインストール
```bash
npm install
```

2. アプリを起動
```bash
npm start
```

### OS 依存の注意点
- **手順自体は共通**です（Windows でも macOS でも `npm install` → `npm start`）。
- 初回起動時に OS のセキュリティ警告が出ることがあります。
  - Windows: 「Windows によって PC が保護されました」が出た場合は、必要に応じて許可してください。
  - macOS: 「開発元を確認できないため開けません」系の警告が出た場合は、システム設定の「プライバシーとセキュリティ」から許可してください。

### 開発用（任意）
```bash
npm run dev
```
`--dev` オプションで DevTools が開きます。

## Arduino セットアップ
1. Arduino IDE で `Arduino/tagbeans/tagbeans.ino` を開く
2. 赤外線センサを `SENSOR_PIN = 6`（デジタル6番）に接続する
3. ボード/ポートを選択して書き込む
4. USB接続したまま、このアプリを `npm start` で起動する

補足:
- ボーレートは `115200` です（スケッチとアプリ側で合わせています）。
- Electron 側は Arduino のシリアルポートを自動検出します。
- このアプリで有効なのは `SENSOR_DETECTED` 行のみです（数値行 `1`〜`5` は無視）。
- 自動検出で拾えない場合は `SENSOR_SERIAL_PORT=/dev/tty.usbmodemxxxx npm start` のようにポートを明示指定できます。

## キー操作
- `1`〜`5`：押した段の動画を表示 / 同じキーをもう一度押すと消える（ON/OFF）

## 赤外線センサ連動
- Arduino のシリアル入力で `SENSOR_DETECTED` を受け取ると、**現在再生中の動画だけ**を先頭（0秒）から再生し直します。
- `SENSOR_DETECTED` 自体は「新規再生トリガー」ではありません。再生中の動画がない場合は何もしません。
- センサで再スタートした直後は、動画が1回最後まで再生されるまで次の `SENSOR_DETECTED` は無視します。
- Arduino 側の互換出力（`1`〜`5` などの数値行）は無視されます。

## 値札（price-tag）の座標調整
値札は `assets/media/price-tag/price{段}_{番号}.png` を読み込みます。  
段ごとの枚数と X 座標は `renderer.js` の変数で調整します。

- 枚数（段ごと）
```js
const PRICE_TAG_COUNTS = [17, 14, 0, 0, 0];
```

- X 座標（段ごと配列）
```js
const PRICE_TAG_X_POSITIONS = [
  generateEvenXPositions(PRICE_TAG_COUNTS[0], DISPLAY_WIDTH_PX, 16, 16),
  generateEvenXPositions(PRICE_TAG_COUNTS[1], DISPLAY_WIDTH_PX, 16, 16),
  [],
  [],
  []
];
```

`generateEvenXPositions(...)` を配列に置き換えれば、値札ごとの X 座標を手動指定できます。  
Y 座標は段の開始位置で固定（1段目=0px, 2段目=108px …）です。

## 動画の座標（X）の調整
動画の X 座標は `renderer.js` の配列で段ごとに指定しています。

```js
let stableVideoXByRow = [950, 350, 950, 300, 300];
```

1段目〜5段目の順で、**ピクセル指定**です。  
値を変えると、その段で再生される動画の横位置が変わります。
