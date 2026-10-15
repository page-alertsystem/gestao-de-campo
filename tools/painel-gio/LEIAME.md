# Painel GIO

Aplicativo do Windows (.NET Framework 4.8, WinForms) para operar o servidor do GIO: ligar, desligar, reiniciar, atualizar para a `main` (com backup do banco e retorno automático em caso de erro), backup do PostgreSQL, logs, início automático com o Windows e atalhos.

## Compilar

Com Mono (Linux):

```bash
A=/usr/lib/mono/4.8-api
mcs -noconfig -nostdlib -target:winexe -optimize+ -langversion:7.2 -out:"Painel GIO.exe" -win32icon:gio.ico \
  -r:$A/mscorlib.dll -r:$A/System.dll -r:$A/System.Core.dll -r:$A/System.Drawing.dll \
  -r:$A/System.Windows.Forms.dll -r:$A/System.ServiceProcess.dll -r:$A/Facades/System.ValueTuple.dll Program.cs
```

Ou com o .NET SDK (Windows): `dotnet build -c Release` usando `PainelGIO.csproj`.

O aplicativo pede permissão de administrador ao abrir (necessário para serviços, tarefa agendada e processos do servidor).
A pasta do GIO é detectada automaticamente (`Área de Trabalho\gio`) e pode ser trocada pelo botão "Escolher pasta do GIO".
