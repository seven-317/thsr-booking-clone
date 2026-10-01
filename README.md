# THSR Booking Clone

以 Next.js App Router 與 Supabase 製作的雙語高鐵訂票期末專題。專案涵蓋車次查詢、圖形驗證碼、會員登入、乘客資料、訂位紀錄與測試付款等完整流程。

> 本專案僅供課程學習與作品展示，並非台灣高鐵官方網站，也不會處理真實付款。

## 功能

- 繁體中文與英文介面
- 響應式車次查詢與票種選擇
- 伺服器端圖形驗證碼與一次性驗證
- Supabase 密碼註冊、登入與會員資料同步
- 乘客資料、訂位建立與歷史訂單查詢
- 測試信用卡付款流程
- App Router API、資料驗證與資料庫 RPC
- Open Graph、Twitter Card、canonical、hreflang、sitemap 與 robots metadata

## 技術

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- next-intl
- Supabase Auth / PostgreSQL

## 本機執行

需求：Node.js 20 以上版本，以及一個 Supabase 專案。

```bash
npm install
cp .env.example .env.local
npm run dev
```

開啟 [http://localhost:3000/zh](http://localhost:3000/zh)。英文版位於 `/en`。

## 環境變數

| 變數 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | 正式網站網址，用於 canonical、sitemap 與分享圖絕對網址 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案網址 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | 僅供伺服器端 API 使用的 service role key |
| `CAPTCHA_HMAC_SECRET` | 驗證碼簽章密鑰，至少 32 個字元 |

請勿將 `.env.local` 或任何正式密鑰提交至版本控制。

## 資料庫設定

在 Supabase SQL Editor 依序執行：

1. `sql/thsr_booking_supabase.sql`
2. `sql/001_add_fares_and_student.sql` 至 `sql/008_member_profile_source_of_truth.sql`
3. `sql/seed_demo_data.sql`

本專題採密碼直接註冊；若要維持目前展示流程，請在 Supabase Auth 設定中關閉電子郵件確認。正式服務應重新啟用驗證並補上郵件與帳號復原流程。

## 測試付款

付款頁提供可自動填入的測試卡資料。API 只接受這組固定資料，且不會連線至真實金流或儲存完整卡號。

## 品質檢查

```bash
npm run lint
npm run build
```

更多 API 與安全邊界說明請參閱 [`docs/backend-api.md`](docs/backend-api.md)。
