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

## キー操作
- `1`〜`5`：押した段の動画を表示 / 同じキーをもう一度押すと消える（ON/OFF）

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
let stableVideoXByRow = [950, 300, 950, 300, 300];
```

1段目〜5段目の順で、**ピクセル指定**です。  
値を変えると、その段で再生される動画の横位置が変わります。
# akebono-pharmacy
# akebono-pharmacy
