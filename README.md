# Skin Diary

피부 변화를 매일 기록하고 비교하는 개인 다이어리. Next.js + Firebase 기반.

## License

© 2026 Taehyeok Lee. All rights reserved.

본 저장소의 코드와 자산은 별도 라이선스가 부여되지 않은 사적 자산입니다 (`UNLICENSED`).
복제, 수정, 재배포, 상업적 이용 등 일체의 권리가 저작권자에게 유보됩니다.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Testing

세 종류의 테스트가 있다. 모두 dev 의존성만 사용한다.

```bash
# 1) Unit — 순수 함수. 외부 서비스 없음.
pnpm test            # = pnpm test:unit

# 2) Firestore Rules — 권한 매트릭스. Firebase Emulator 필요.
#    별도 셸에서 emulator 부팅:
#      brew install firebase-tools   # (또는) npm i -g firebase-tools
#      pnpm emulators
pnpm test:rules

# 3) E2E — 브라우저 시나리오. `webServer`가 `pnpm dev`를 자동 부팅.
#    `.env.local`에 NEXT_PUBLIC_FIREBASE_* 키가 있어야 한다.
pnpm test:e2e
```

새 테스트는 `tests/{unit,rules,e2e}/` 하위에 추가한다. Vitest는 `*.test.ts`,
Playwright는 `*.spec.ts` 패턴을 사용한다.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

<!-- vercel-preview-smoke 2026-05-10 -->

