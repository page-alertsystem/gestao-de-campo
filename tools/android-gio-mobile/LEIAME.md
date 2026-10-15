# GIO Mobile — aplicativo Android

Aplicativo leve (WebView) que abre o GIO Mobile em tela cheia, com câmera, GPS e botão voltar.

- Endereço padrão: `https://page-alertsystem.github.io/gestao-de-campo/mobile/`
  (pode ser trocado no próprio app: botão **Alterar endereço** na tela de erro de conexão).
- O app se identifica com `GIOMobileApp` no user-agent (o site esconde o aviso de "baixar app").
- O `.apk` publicado fica em `public/mobile/gio-mobile.apk` (servido em `/mobile/gio-mobile.apk`).

## Gerar uma nova versão

1. Aumente `android:versionCode` e `android:versionName` em `AndroidManifest.xml`.
2. Copie para esta pasta a chave de assinatura `gio-mobile.jks` e o arquivo `keystore-senha.txt`
   (ficam no servidor em `.gio-data\android\`; **sem a mesma chave os celulares não conseguem atualizar o app**).
3. Em Linux com `android-sdk-platform-23 aapt apksigner zipalign dalvik-exchange default-jdk`: `./build-apk.sh`
4. Copie `bin/gio-mobile.apk` para `public/mobile/gio-mobile.apk`.
