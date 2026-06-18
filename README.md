# DUEL v2 — 1v1 Platform Fighter

🎮 即時連線平台格鬥遊戲，角色選擇 + 隨機場景

---

## 新功能

- **角色選擇**：SCOUT（快速型）vs TANK（重砲型）
- **3 個隨機場景**：NEON CITY / LAVA RIFT / VOID STATION
- **場景機關**：移動平台、消失平台、彈射墊、岩漿危險區
- **視覺升級**：Camera Shake、浮動傷害數字、主題背景

## 操作鍵

| 動作 | 鍵盤 |
|------|------|
| 移動 | `A` / `D` |
| 跳躍（二段跳）| `W` / `Space` |
| 射擊 | `J` / `Z` |
| 衝刺 | `K` / `X` |

## 規則

- HP 歸零或被打落平台即判負
- 衝刺期間短暫無敵
- 每局結束按 **REMATCH** 重開（隨機換場景）

## 技術架構

- **後端**：Node.js + Socket.io（Server Authoritative）
- **前端**：純 HTML / CSS / Canvas
- **部署**：Render.com

## 本地執行

```
npm install
node server/index.js
```

開啟 `http://localhost:3000`，兩個分頁輸入同一個 Room ID 即可測試。
