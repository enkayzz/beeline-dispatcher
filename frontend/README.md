# Фронтенд

Из этой папки:

```bash
npm ci
npm run dev
```

Сборка: `npm run build`. Проверки: `npx playwright install chromium`, затем `npm test` (со сборкой и запуском preview).

- `src/App.tsx` — экраны и состояние приложения.
- `src/MapView.tsx` — карта.
- `src/api.ts` — адаптер и демонстрационный расчёт.
- `src/types.ts` — текущие TypeScript-типы контракта.
- `src/validation.ts` — проверка импорта.
- `tests/` — проверка ограничений и браузерные сценарии.

Общие данные находятся в `../data/examples/`, документация — в `../docs/`. Новые самостоятельные экраны и переиспользуемые компоненты выделяйте в `src/pages/` и `src/components/` по мере разработки. Перед интеграцией сервера согласуйте [контракт API](../docs/API_CONTRACT.md).
