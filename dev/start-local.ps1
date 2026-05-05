$env:NODE_OPTIONS = "--openssl-legacy-provider"
Set-Location "C:\Users\vados\Documents\Codex\2026-05-02\https-github-com-zurichat-zc-main"
yarn dev 2>&1 | Tee-Object -FilePath "codex-dev.log"
