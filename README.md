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
# akebono-pharmacy
