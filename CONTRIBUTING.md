# Совместная работа

## Начало

```bash
git clone https://github.com/enkayzz/beeline-dispatcher.git
cd beeline-dispatcher
git switch -c feature/short-description
cd frontend
npm ci
npm run dev
```

Если репозиторий уже клонирован, перед созданием ветки обновите `main`: `git switch main`, затем `git pull --ff-only`. После переноса структуры npm-команды выполняются в `frontend/`.

## Зоны ответственности

- Интерфейс и клиентский адаптер: `frontend/`.
- Сервер и алгоритмы: `backend/`.
- Публичные синтетические примеры: `data/examples/`.
- Подготовка данных: `scripts/`.
- Контракт и общие решения: `docs/`.

API согласуем через `docs/API_CONTRACT.md`; изменения схемы сопровождаем обновлением типов и потребителей. Сервер пока отсутствует, поэтому CI проверяет только фронтенд.

## Перед Pull Request

В `frontend/` выполните:

```bash
npx playwright install chromium
npm test
```

Команда тестов также проверяет production-сборку. Затем закоммитьте изменения, отправьте свою ветку (`git push -u origin feature/short-description`) и создайте Pull Request в `main`. Опишите результат, проверку и влияние на другие компоненты. Попросите коллегу проверить PR; объединяйте после успешного CI.

Это правило командной работы, а не утверждение о включённой защите ветки на GitHub. Не включайте исходные локальные CSV, секреты, node_modules и результаты сборки в коммит.
