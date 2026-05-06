# ZC_MAIN

Фронтенд Zuri Chat на React, Webpack 5 и single-spa микрофронтендах.

В этом репозитории теперь есть полноценная локальная end-to-end реализация голосовых сообщений, которую можно демонстрировать и тестировать без зависимости от публичного backend Zuri.

## Локальная Реализация Голосовых Сообщений

В проект добавлен локальный backend adapter для разработки, тестирования и демонстрации голосовых сообщений.

В локальном режиме можно проверить:

- регистрацию, подтверждение аккаунта, вход и создание workspace
- запись с микрофона с таймером, отменой и автоостановкой через 5 минут
- предпросмотр голосового сообщения перед отправкой
- удаление записи и повторную запись
- локальную загрузку и хранение аудиофайла
- сохранение голосовых сообщений в истории чата
- воспроизведение с `play/pause`, waveform, progress slider и отображением длительности
- скачивание записанного аудио
- переключение скорости `1x`, `1.5x`, `2x`
- отметку о прослушивании
- privacy toggle с сохранением настройки
- optional flow для транскрипции

## Локальный Запуск

Установить зависимости:

```bash
yarn install
```

Скопировать переменные окружения:

```bash
cp .env.example .env
```

Запустить локальный фронтенд и локальный mock API вместе:

```bash
yarn dev:local
```

Либо запустить их отдельно:

```bash
yarn mock-api
```

```bash
powershell -ExecutionPolicy Bypass -File dev/start-local.ps1
```

Локальные адреса:

- Frontend: [http://localhost:9000](http://localhost:9000)
- Local API: [http://localhost:5050](http://localhost:5050)

## Локальное Подтверждение Email

В локальном режиме реальные письма не отправляются.

Используй этот код подтверждения при регистрации:

```text
123456
```

## Доступные Скрипты

```bash
yarn dev
yarn mock-api
yarn dev:local
yarn test
yarn test:ui
yarn test:messaging
yarn build
yarn clean
yarn clean-fresh
```

## Тесты

Запуск полного набора тестов:

```bash
yarn test
```

Запуск только UI-тестов:

```bash
yarn test:ui
```

Запуск только тестов локального messaging:

```bash
yarn test:messaging
```

## Сценарий Для Демонстрации

Рекомендуемый сценарий для защиты:

1. Запустить проект через `yarn dev:local`.
2. Открыть [http://localhost:9000](http://localhost:9000).
3. Зарегистрировать новый аккаунт.
4. Подтвердить аккаунт кодом `123456`.
5. Выполнить вход.
6. Создать workspace.
7. Открыть `all-dms`.
8. Записать голосовое сообщение.
9. Показать таймер, stop, cancel и preview.
10. Отправить голосовое сообщение.
11. Воспроизвести его, перемотать по waveform, переключить скорость и скачать файл.
12. Перезагрузить страницу и показать, что сообщение осталось в истории.
13. При желании показать `dev/mock-api/data/db.json` и `dev/mock-api/uploads/voice-messages`, чтобы продемонстрировать локальное сохранение.

## Архитектурные Заметки

Для локальной проверки проект использует:

- mock API в [`dev/mock-api/server.js`](dev/mock-api/server.js)
- локальное хранение voice-файлов в `dev/mock-api/uploads/voice-messages`
- локальный messaging microfrontend в [`packages/zuri-plugin-messaging/src/root.component.js`](packages/zuri-plugin-messaging/src/root.component.js)
- UI-интеграцию в [`packages/ui/src/message-board/MessageBoard.jsx`](packages/ui/src/message-board/MessageBoard.jsx) и [`packages/ui/src/message-pane-input/MessagePaneInput.jsx`](packages/ui/src/message-pane-input/MessagePaneInput.jsx)

## Ограничения

- Оригинальный production backend Zuri для этой локальной реализации не требуется.
- Транскрипция реализована как optional placeholder flow и при необходимости может быть заменена на реальный STT provider.
- Оптимизация аудио сейчас выполняется на клиенте через запись с пониженным битрейтом. Отдельный server-side transcoding pipeline не реализован.
- Реальная запись с микрофона всё равно зависит от browser/OS permission в момент запуска.

## Вклад В Проект

Полезные документы:

- [Contribution Guide](docs/CONTRIBUTING.md)
- [Styling Guide](docs/STYLING.md)

Линтинг и форматирование:

```bash
yarn lint
yarn lint:js
yarn prettify
```
