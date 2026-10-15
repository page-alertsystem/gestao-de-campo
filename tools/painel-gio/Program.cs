using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PainelGIO
{
    internal static class Program
    {
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main()
        {
            // O painel precisa de administrador (serviços, tarefa agendada e processos do servidor).
            var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            var isAdmin = new System.Security.Principal.WindowsPrincipal(identity).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
            if (!isAdmin && Environment.GetEnvironmentVariable("GIO_PAINEL_SKIP_ADMIN") != "1")
            {
                try { Process.Start(new ProcessStartInfo(Application.ExecutablePath) { UseShellExecute = true, Verb = "runas" }); }
                catch { MessageBox.Show("O Painel GIO precisa ser aberto como administrador.", "Painel GIO", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
                return;
            }
            try { if (Environment.OSVersion.Version.Major >= 6) SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    internal static class Theme
    {
        public static readonly Color Orange = Color.FromArgb(242, 101, 34);
        public static readonly Color Dark = Color.FromArgb(44, 48, 50);
        public static readonly Color Background = Color.FromArgb(245, 246, 248);
        public static readonly Color Card = Color.White;
        public static readonly Color Muted = Color.FromArgb(110, 116, 122);
        public static readonly Color Green = Color.FromArgb(39, 174, 96);
        public static readonly Color Red = Color.FromArgb(214, 48, 49);
        public static readonly Color Yellow = Color.FromArgb(230, 162, 26);
        public static readonly Color Gray = Color.FromArgb(170, 175, 180);
        public static readonly Font Title = new Font("Segoe UI Semibold", 16f);
        public static readonly Font Subtitle = new Font("Segoe UI", 9f);
        public static readonly Font Section = new Font("Segoe UI Semibold", 10f);
        public static readonly Font Body = new Font("Segoe UI", 9.5f);
        public static readonly Font BodyBold = new Font("Segoe UI Semibold", 9.5f);
        public static readonly Font Mono = new Font("Consolas", 9f);
    }

    /// <summary>Linha de status: bolinha colorida + título + valor.</summary>
    internal sealed class StatusRow : Panel
    {
        private readonly Label dot = new Label();
        private readonly Label value = new Label();

        public StatusRow(string title)
        {
            Height = 46;
            Dock = DockStyle.Top;
            Padding = new Padding(4, 4, 4, 4);
            dot.Text = "●";
            dot.Font = new Font("Segoe UI", 14f);
            dot.ForeColor = Theme.Gray;
            dot.SetBounds(0, 6, 26, 30);
            var label = new Label { Text = title, Font = Theme.BodyBold, ForeColor = Theme.Dark, AutoSize = false };
            label.SetBounds(28, 4, 300, 18);
            value.Font = Theme.Body;
            value.ForeColor = Theme.Muted;
            value.AutoSize = false;
            value.AutoEllipsis = true;
            value.SetBounds(28, 22, 300, 20);
            value.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
            label.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
            Controls.Add(dot);
            Controls.Add(label);
            Controls.Add(value);
            Resize += (s, e) => { label.Width = Width - 32; value.Width = Width - 32; };
        }

        public void Set(Color color, string text)
        {
            dot.ForeColor = color;
            value.Text = text;
        }
    }

    internal sealed class MainForm : Form
    {
        private string gioFolder;
        private readonly Label folderLabel = new Label();
        private readonly StatusRow serverRow = new StatusRow("Servidor GIO");
        private readonly StatusRow databaseRow = new StatusRow("Banco de dados (PostgreSQL)");
        private readonly StatusRow movideskRow = new StatusRow("Integração Movidesk");
        private readonly StatusRow versionRow = new StatusRow("Versão instalada");
        private readonly StatusRow autoStartRow = new StatusRow("Iniciar com o Windows");
        private readonly StatusRow backupRow = new StatusRow("Último backup do banco");
        private readonly StatusRow publicRow = new StatusRow("Link público (GitHub)");
        private const string PagesUrl = "https://page-alertsystem.github.io/gestao-de-campo/";
        private readonly RichTextBox output = new RichTextBox();
        private readonly Label busyLabel = new Label();
        private readonly ProgressBar busyBar = new ProgressBar();
        private readonly Timer refreshTimer = new Timer();
        private readonly System.Collections.Generic.List<Button> actionButtons = new System.Collections.Generic.List<Button>();
        private Button autoStartButton;
        private bool busy;
        private bool refreshing;

        private const string TaskName = "GIO - Servidor";

        public MainForm()
        {
            Text = "Painel GIO";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(980, 820);
            Size = new Size(1080, 880);
            BackColor = Theme.Background;
            Font = Theme.Body;
            AutoScaleMode = AutoScaleMode.Dpi;

            gioFolder = LoadFolder();
            BuildLayout();

            refreshTimer.Interval = 5000;
            refreshTimer.Tick += async (s, e) => await RefreshStatusAsync(false);
            Shown += async (s, e) =>
            {
                Log("Painel GIO pronto. Pasta do sistema: " + gioFolder, Theme.Muted);
                if (!Directory.Exists(gioFolder) || !File.Exists(Path.Combine(gioFolder, "package.json")))
                    Log("Atenção: a pasta do GIO não foi encontrada. Use \"Escolher pasta do GIO\".", Theme.Red);
                await RefreshStatusAsync(true);
                refreshTimer.Start();
            };
        }

        // ------------------------------------------------------------------ layout
        private void BuildLayout()
        {
            var header = new Panel { Dock = DockStyle.Top, Height = 74, BackColor = Theme.Dark };
            var accent = new Panel { Dock = DockStyle.Bottom, Height = 4, BackColor = Theme.Orange };
            var title = new Label { Text = "Painel GIO", Font = Theme.Title, ForeColor = Color.White, AutoSize = true, Location = new Point(20, 10) };
            folderLabel.Font = Theme.Subtitle;
            folderLabel.ForeColor = Color.FromArgb(200, 205, 210);
            folderLabel.AutoSize = true;
            folderLabel.Location = new Point(22, 44);
            folderLabel.Text = "Gestão Integrada de Operações · " + gioFolder;
            header.Controls.Add(title);
            header.Controls.Add(folderLabel);
            header.Controls.Add(accent);

            var body = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 2, Padding = new Padding(14) };
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 360));
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            body.RowStyles.Add(new RowStyle(SizeType.Absolute, 500));
            body.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            // Status
            var statusCard = Card("Situação agora");
            var statusList = new Panel { Dock = DockStyle.Fill, Padding = new Padding(4, 0, 4, 0) };
            foreach (var row in new[] { backupRow, autoStartRow, versionRow, publicRow, movideskRow, databaseRow, serverRow }) statusList.Controls.Add(row);
            statusCard.Controls.Add(statusList);
            statusList.BringToFront();

            // Ações
            var actionsCard = Card("O que você quer fazer?");
            var columns = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
            columns.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            columns.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            var left = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(2) };
            var right = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(2) };
            columns.Controls.Add(left, 0, 0);
            columns.Controls.Add(right, 1, 0);
            var actions = left;
            actions.Controls.Add(Group("Operação"));
            actions.Controls.Add(ActionButton("▶  Ligar o GIO", "Inicia o banco (se estiver parado) e o servidor do GIO.", true, async () => await RunAction("Ligando o GIO", StartScript())));
            actions.Controls.Add(ActionButton("■  Desligar o GIO", "Para o servidor do GIO. Ninguém conseguirá acessar até ligar de novo.", false, async () =>
            {
                if (Confirm("Desligar o GIO? Os usuários perderão o acesso até ele ser ligado novamente.")) await RunAction("Desligando o GIO", StopScript());
            }));
            actions.Controls.Add(ActionButton("⟳  Reiniciar o GIO", "Desliga e liga de novo. Use quando algo travar ou depois de mudar o .env.server.", false, async () => await RunAction("Reiniciando o GIO", StopScript() + "\n" + StartScript())));
            actions.Controls.Add(ActionButton("🌐  Abrir o GIO no navegador", "Abre o sistema nesta máquina.", false, () => { OpenUrl("http://127.0.0.1:" + Port() + "/"); return Task.CompletedTask; }, false));

            actions.Controls.Add(Group("Acesso pela internet"));
            actions.Controls.Add(ActionButton("🌍  Publicar no link do GitHub", "Abre um túnel seguro até este servidor e atualiza o link https://page-alertsystem.github.io/gestao-de-campo/ (leva 1 a 3 minutos para valer).", true, async () =>
            {
                if (!Confirm("Publicar o GIO na internet?\n\nO link do GitHub passará a acessar este servidor. Qualquer pessoa com o link verá a tela de login (o acesso continua exigindo e-mail e senha).")) return;
                try { File.WriteAllText(Path.Combine(gioFolder, ".gio-publicar-internet"), DateTime.Now.ToString("s")); } catch { }
                await RunAction("Publicando na internet", "& .\\scripts\\publicar-internet.ps1 | ForEach-Object { Write-Host \"$_\" }");
            }));
            actions.Controls.Add(ActionButton("⛔  Parar publicação na internet", "Fecha o túnel. O GIO continua funcionando na rede interna.", false, async () =>
            {
                if (!Confirm("Parar a publicação? O link do GitHub deixará de funcionar até publicar de novo.")) return;
                try { File.Delete(Path.Combine(gioFolder, ".gio-publicar-internet")); } catch { }
                await RunAction("Parando a publicação", "& .\\scripts\\parar-publicacao.ps1 | ForEach-Object { Write-Host \"$_\" }");
            }));
            actions.Controls.Add(ActionButton("🔗  Copiar link para os usuários", "Copia o link do GitHub Pages para a área de transferência.", false, () => { Clipboard.SetText(PagesUrl); Log("Link copiado: " + PagesUrl, Theme.Green); return Task.CompletedTask; }, false));

            actions = right;
            actions.Controls.Add(Group("Atualização"));
            actions.Controls.Add(ActionButton("🔎  Verificar atualizações", "Consulta o GitHub e mostra se a main tem uma versão nova.", false, async () => { await RunAction("Consultando o GitHub", "git fetch origin --prune 2>&1 | Out-Host; Write-Host 'Consulta concluída.'"); await RefreshStatusAsync(true); }));
            actions.Controls.Add(ActionButton("⬆  Atualizar para a última versão (main)", "Faz backup do banco, baixa a main do GitHub, instala, compila e reinicia. Se algo falhar, volta sozinho para a versão anterior.", true, async () =>
            {
                if (Confirm("Atualizar o GIO para a última versão da main?\n\n1. Backup do banco\n2. Baixa a main do GitHub\n3. Instala dependências e compila\n4. Reinicia o GIO\n\nO sistema fica fora do ar por 1 a 3 minutos. Se der erro, a versão anterior é restaurada automaticamente."))
                    await RunAction("Atualizando para a main", UpdateScript());
            }));

            actions.Controls.Add(Group("Manutenção"));
            actions.Controls.Add(ActionButton("💾  Fazer backup do banco agora", "Salva uma cópia completa do banco em .gio-data\\backups (guarda os 30 últimos).", false, async () => await RunAction("Fazendo backup do banco", BackupScript())));
            actions.Controls.Add(ActionButton("📁  Abrir pasta de backups", "Mostra os arquivos de backup.", false, () => { var dir = Path.Combine(gioFolder, ".gio-data", "backups"); Directory.CreateDirectory(dir); Process.Start("explorer.exe", "\"" + dir + "\""); return Task.CompletedTask; }, false));
            actions.Controls.Add(ActionButton("📄  Ver registros (logs)", "Mostra as últimas linhas do log do servidor aqui embaixo.", false, () => { ShowLogs(); return Task.CompletedTask; }, false));
            autoStartButton = ActionButton("⏻  Iniciar com o Windows: ativar/desativar", "Liga o GIO sozinho quando o servidor for reiniciado.", false, async () => await ToggleAutoStart());
            actions.Controls.Add(autoStartButton);
            actions.Controls.Add(ActionButton("⚙  Editar configurações (.env.server)", "Abre o arquivo de configuração no Bloco de Notas. Reinicie o GIO depois de salvar.", false, () => { Process.Start("notepad.exe", "\"" + Path.Combine(gioFolder, ".env.server") + "\""); return Task.CompletedTask; }, false));
            actions.Controls.Add(ActionButton("📂  Abrir pasta do GIO", "Abre a pasta do sistema no Explorer.", false, () => { Process.Start("explorer.exe", "\"" + gioFolder + "\""); return Task.CompletedTask; }, false));
            actions.Controls.Add(ActionButton("…  Escolher pasta do GIO", "Use se o GIO estiver instalado em outra pasta.", false, async () => { ChooseFolder(); await RefreshStatusAsync(true); }, false));
            actionsCard.Controls.Add(columns);
            columns.BringToFront();
            foreach (var panel in new[] { left, right })
            {
                var flow = panel;
                flow.Resize += (s, e) => { foreach (Control c in flow.Controls) c.Width = Math.Max(200, flow.ClientSize.Width - 10); };
            }

            // Saída
            var outputCard = Card("Acompanhamento");
            output.Dock = DockStyle.Fill;
            output.ReadOnly = true;
            output.BorderStyle = BorderStyle.None;
            output.BackColor = Color.FromArgb(30, 33, 36);
            output.ForeColor = Color.FromArgb(225, 228, 232);
            output.Font = Theme.Mono;
            output.DetectUrls = true;
            output.LinkClicked += (s, e) => OpenUrl(e.LinkText);
            var busyPanel = new Panel { Dock = DockStyle.Bottom, Height = 30, Visible = false, Name = "busyPanel" };
            busyBar.Style = ProgressBarStyle.Marquee;
            busyBar.MarqueeAnimationSpeed = 30;
            busyBar.SetBounds(0, 8, 160, 14);
            busyLabel.AutoSize = true;
            busyLabel.Location = new Point(170, 6);
            busyLabel.ForeColor = Theme.Dark;
            busyLabel.Font = Theme.BodyBold;
            busyPanel.Controls.Add(busyBar);
            busyPanel.Controls.Add(busyLabel);
            outputCard.Controls.Add(output);
            outputCard.Controls.Add(busyPanel);
            output.BringToFront();

            body.Controls.Add(statusCard, 0, 0);
            body.Controls.Add(outputCard, 0, 1);
            body.SetColumnSpan(outputCard, 2);
            body.Controls.Add(actionsCard, 1, 0);

            Controls.Add(body);
            Controls.Add(header);
        }

        private static Panel Card(string title)
        {
            var card = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Card, Padding = new Padding(14, 10, 14, 12), Margin = new Padding(6) };
            var label = new Label { Text = title.ToUpperInvariant(), Dock = DockStyle.Top, Height = 26, Font = Theme.Section, ForeColor = Theme.Orange };
            card.Controls.Add(label);
            return card;
        }

        private static Label Group(string text)
        {
            return new Label { Text = text, Font = Theme.BodyBold, ForeColor = Theme.Muted, AutoSize = false, Width = 300, Height = 24, TextAlign = ContentAlignment.BottomLeft, Margin = new Padding(3, 6, 3, 0) };
        }

        private Button ActionButton(string text, string tooltip, bool primary, Func<Task> action, bool lockWhileBusy = true)
        {
            var button = new Button
            {
                Text = text,
                Width = 300,
                Height = 34,
                TextAlign = ContentAlignment.MiddleLeft,
                FlatStyle = FlatStyle.Flat,
                Font = Theme.Body,
                Cursor = Cursors.Hand,
                BackColor = primary ? Theme.Orange : Color.FromArgb(240, 241, 243),
                ForeColor = primary ? Color.White : Theme.Dark,
                Margin = new Padding(3),
                UseVisualStyleBackColor = false,
            };
            button.FlatAppearance.BorderSize = 0;
            new ToolTip { AutoPopDelay = 15000 }.SetToolTip(button, tooltip);
            button.Click += async (s, e) =>
            {
                if (lockWhileBusy && busy) return;
                try { await action(); }
                catch (Exception ex) { Log("Erro: " + ex.Message, Theme.Red); }
            };
            if (lockWhileBusy) actionButtons.Add(button);
            return button;
        }

        // ------------------------------------------------------------------ pasta
        private static string ConfigFile => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PainelGIO", "pasta.txt");

        private static string LoadFolder()
        {
            try { if (File.Exists(ConfigFile)) { var saved = File.ReadAllText(ConfigFile).Trim(); if (Directory.Exists(saved)) return saved; } } catch { }
            var candidates = new[]
            {
                Path.Combine(Path.GetDirectoryName(Application.ExecutablePath) ?? "", "gio"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "gio"),
                @"C:\Users\Administrador\Desktop\gio",
            };
            return candidates.FirstOrDefault(c => File.Exists(Path.Combine(c, "package.json"))) ?? candidates[1];
        }

        private void ChooseFolder()
        {
            using (var dialog = new FolderBrowserDialog { Description = "Selecione a pasta do GIO (a que tem o package.json)", SelectedPath = gioFolder })
            {
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                if (!File.Exists(Path.Combine(dialog.SelectedPath, "package.json"))) { MessageBox.Show(this, "Essa pasta não parece ser a do GIO (não tem package.json).", "Painel GIO", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
                gioFolder = dialog.SelectedPath;
                Directory.CreateDirectory(Path.GetDirectoryName(ConfigFile));
                File.WriteAllText(ConfigFile, gioFolder);
                folderLabel.Text = "Gestão Integrada de Operações · " + gioFolder;
                Log("Pasta do GIO alterada para " + gioFolder, Theme.Muted);
            }
        }

        // ------------------------------------------------------------------ configuração
        private string EnvValue(string key)
        {
            try
            {
                var file = Path.Combine(gioFolder, ".env.server");
                if (!File.Exists(file)) return null;
                foreach (var raw in File.ReadAllLines(file))
                {
                    var line = raw.Trim();
                    if (line.StartsWith("#") || !line.StartsWith(key + "=", StringComparison.OrdinalIgnoreCase) && !Regex.IsMatch(line, "^" + Regex.Escape(key) + @"\s*=")) continue;
                    var value = line.Substring(line.IndexOf('=') + 1).Trim().Trim('"', '\'');
                    return value;
                }
            }
            catch { }
            return null;
        }

        private string Port()
        {
            var value = EnvValue("GIO_PORT");
            return string.IsNullOrWhiteSpace(value) ? "4173" : value;
        }

        // ------------------------------------------------------------------ status
        private async Task RefreshStatusAsync(bool includeGit)
        {
            if (refreshing) return;
            refreshing = true;
            try
            {
                var port = Port();
                var health = await Task.Run(() => HttpGet("http://127.0.0.1:" + port + "/api/health"));
                if (health == null)
                {
                    serverRow.Set(Theme.Red, "Desligado ou sem resposta (porta " + port + ")");
                    movideskRow.Set(Theme.Gray, "Indisponível com o GIO desligado");
                }
                else
                {
                    var online = health.Contains("\"status\":\"online\"");
                    serverRow.Set(online ? Theme.Green : Theme.Yellow, online ? "Ligado · http://127.0.0.1:" + port : "Ligado, mas sem acesso ao banco");
                    var movidesk = health.Contains("\"movideskConfigured\":true");
                    movideskRow.Set(movidesk ? Theme.Green : Theme.Yellow, movidesk ? "Configurada" : "Faltam dados no .env.server");
                }

                var service = await Task.Run(() => FindPostgresService());
                if (service == null) databaseRow.Set(Theme.Red, "Serviço do PostgreSQL não encontrado");
                else
                {
                    var running = service.Status == ServiceControllerStatus.Running;
                    databaseRow.Set(running ? Theme.Green : Theme.Red, (running ? "Em execução" : "Parado") + " · " + service.ServiceName);
                }

                var task = await Task.Run(() => RunQuick("schtasks.exe", "/Query /TN \"" + TaskName + "\""));
                var autoOn = task.exitCode == 0;
                autoStartRow.Set(autoOn ? Theme.Green : Theme.Gray, autoOn ? "Ativado (liga 1 minuto após o Windows)" : "Desativado");

                var backups = Path.Combine(gioFolder, ".gio-data", "backups");
                var last = Directory.Exists(backups) ? new DirectoryInfo(backups).GetFiles("gio-*.dump").OrderByDescending(f => f.LastWriteTime).FirstOrDefault() : null;
                if (last == null) backupRow.Set(Theme.Yellow, "Nenhum backup feito ainda");
                else
                {
                    var age = DateTime.Now - last.LastWriteTime;
                    backupRow.Set(age.TotalDays > 7 ? Theme.Yellow : Theme.Green, last.LastWriteTime.ToString("dd/MM/yyyy HH:mm") + " · " + (last.Length / 1024.0 / 1024.0).ToString("0.0") + " MB");
                }

                RefreshPublicStatus();
                if (includeGit) await RefreshGitAsync();
            }
            catch (Exception ex) { Log("Falha ao atualizar a situação: " + ex.Message, Theme.Red); }
            finally { refreshing = false; }
        }

        private void RefreshPublicStatus()
        {
            try
            {
                var pidFile = Path.Combine(gioFolder, ".gio-tunnel.pid");
                var running = false;
                if (File.Exists(pidFile) && int.TryParse(File.ReadAllText(pidFile).Trim(), out var pid))
                {
                    try { running = Process.GetProcessById(pid).ProcessName.Equals("cloudflared", StringComparison.OrdinalIgnoreCase); } catch { running = false; }
                }
                if (!running) { publicRow.Set(Theme.Gray, "Não publicado (só rede interna)"); return; }
                var log = Path.Combine(gioFolder, ".logs", "gio-tunnel.log");
                string url = null;
                if (File.Exists(log))
                {
                    using (var stream = new FileStream(log, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (var reader = new StreamReader(stream))
                    {
                        var matches = Regex.Matches(reader.ReadToEnd(), @"https://[a-z0-9-]+\.trycloudflare\.com");
                        if (matches.Count > 0) url = matches[matches.Count - 1].Value;
                    }
                }
                publicRow.Set(Theme.Green, "Publicado · " + (url ?? "túnel ativo"));
            }
            catch (Exception ex) { publicRow.Set(Theme.Yellow, "Não foi possível verificar: " + ex.Message); }
        }

        private async Task RefreshGitAsync()
        {
            var branch = await Task.Run(() => RunQuick("git", "rev-parse --abbrev-ref HEAD", gioFolder));
            var commit = await Task.Run(() => RunQuick("git", "log -1 --format=%h·%cd --date=format:%d/%m/%Y", gioFolder));
            if (branch.exitCode != 0) { versionRow.Set(Theme.Red, "Não foi possível ler o Git desta pasta"); return; }
            var behind = await Task.Run(() => RunQuick("git", "rev-list --count HEAD..origin/main", gioFolder));
            var dirty = await Task.Run(() => RunQuick("git", "status --porcelain --untracked-files=no", gioFolder));
            var text = branch.text.Trim() + " · " + commit.text.Trim();
            var color = Theme.Green;
            int count;
            if (behind.exitCode == 0 && int.TryParse(behind.text.Trim(), out count) && count > 0) { text += " · main tem " + count + " novidade(s)"; color = Theme.Yellow; }
            else if (behind.exitCode == 0) text += " · em dia com a main";
            if (!string.IsNullOrWhiteSpace(dirty.text)) { text += " · alterações locais"; color = Theme.Yellow; }
            versionRow.Set(color, text);
        }

        private static ServiceController FindPostgresService()
        {
            try { return ServiceController.GetServices().Where(s => s.ServiceName.StartsWith("postgresql", StringComparison.OrdinalIgnoreCase)).OrderByDescending(s => s.ServiceName).FirstOrDefault(); }
            catch { return null; }
        }

        private static string HttpGet(string url)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 2500;
                request.ReadWriteTimeout = 2500;
                request.Proxy = null;
                using (var response = (HttpWebResponse)request.GetResponse())
                using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                    return reader.ReadToEnd().Replace(" ", "");
            }
            catch (WebException ex) when (ex.Response is HttpWebResponse r)
            {
                using (var reader = new StreamReader(r.GetResponseStream(), Encoding.UTF8)) return reader.ReadToEnd().Replace(" ", "");
            }
            catch { return null; }
        }

        private static string FreshPath()
        {
            var machine = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.Machine) ?? "";
            var user = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User) ?? "";
            return machine + ";" + user;
        }

        private static (int exitCode, string text) RunQuick(string file, string args, string workingDirectory = null)
        {
            try
            {
                var info = new ProcessStartInfo(file, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8 };
                if (workingDirectory != null) info.WorkingDirectory = workingDirectory;
                info.EnvironmentVariables["Path"] = FreshPath();
                using (var process = Process.Start(info))
                {
                    var text = process.StandardOutput.ReadToEnd();
                    process.StandardError.ReadToEnd();
                    process.WaitForExit(15000);
                    return (process.ExitCode, text);
                }
            }
            catch (Exception ex) { return (-1, ex.Message); }
        }

        // ------------------------------------------------------------------ execução
        private async Task RunAction(string title, string script)
        {
            if (busy) return;
            if (!File.Exists(Path.Combine(gioFolder, "package.json"))) { Log("A pasta do GIO não foi encontrada: " + gioFolder, Theme.Red); return; }
            SetBusy(true, title + "...");
            Log("");
            Log("━━ " + title + " · " + DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss"), Theme.Orange);
            var exit = await RunPowerShell(script);
            if (exit == 0) Log("✔ Concluído.", Theme.Green);
            else Log("✖ Não foi possível concluir (código " + exit + "). Veja as mensagens acima.", Theme.Red);
            SetBusy(false, "");
            await RefreshStatusAsync(true);
        }

        private Task<int> RunPowerShell(string script)
        {
            var completion = new TaskCompletionSource<int>();
            var full = "$ErrorActionPreference = 'Stop'\n$ProgressPreference = 'SilentlyContinue'\n[Console]::OutputEncoding = [Text.Encoding]::UTF8\n$OutputEncoding = [Text.Encoding]::UTF8\n" +
                       "Set-Location -LiteralPath '" + gioFolder.Replace("'", "''") + "'\n" +
                       "try {\n" + script + "\n} catch { Write-Host ('ERRO: ' + $_.Exception.Message); exit 1 }\nexit 0\n";
            var encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(full));
            var info = new ProcessStartInfo("powershell.exe", "-NoProfile -NonInteractive -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand " + encoded)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
                WorkingDirectory = gioFolder,
            };
            info.EnvironmentVariables["Path"] = FreshPath();
            info.EnvironmentVariables["CI"] = "true";
            info.EnvironmentVariables["NO_COLOR"] = "1";
            info.EnvironmentVariables["FORCE_COLOR"] = "0";
            var process = new Process { StartInfo = info, EnableRaisingEvents = true };
            process.OutputDataReceived += (s, e) => { if (e.Data != null) Log(e.Data, LineColor(e.Data)); };
            process.ErrorDataReceived += (s, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) Log(e.Data, Theme.Yellow); };
            process.Exited += (s, e) => { process.WaitForExit(); completion.TrySetResult(process.ExitCode); process.Dispose(); };
            try
            {
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                Log("Não foi possível iniciar o PowerShell: " + ex.Message, Theme.Red);
                completion.TrySetResult(-1);
            }
            return completion.Task;
        }

        private static Color LineColor(string line)
        {
            if (line.StartsWith("ERRO") || line.Contains("falhou")) return Theme.Red;
            if (line.StartsWith("==>")) return Color.FromArgb(120, 190, 255);
            if (line.StartsWith("OK") || line.Contains("sucesso")) return Theme.Green;
            return Color.FromArgb(225, 228, 232);
        }

        private void SetBusy(bool value, string text)
        {
            busy = value;
            foreach (var button in actionButtons) button.Enabled = !value;
            var panel = output.Parent.Controls["busyPanel"];
            if (panel != null) panel.Visible = value;
            busyLabel.Text = text;
            Cursor = value ? Cursors.AppStarting : Cursors.Default;
        }

        private static readonly Regex Ansi = new Regex(@"(\x1B|_x001B_)\[[0-9;]*[A-Za-z]", RegexOptions.Compiled);

        private void Log(string text, Color? color = null)
        {
            if (text == null) return;
            if (text.StartsWith("#< CLIXML") || text.StartsWith("<Objs ")) return;
            text = Ansi.Replace(text, "");
            if (InvokeRequired) { BeginInvoke(new Action(() => Log(text, color))); return; }
            output.SelectionStart = output.TextLength;
            output.SelectionLength = 0;
            output.SelectionColor = color ?? Color.FromArgb(225, 228, 232);
            output.AppendText(text + Environment.NewLine);
            output.SelectionColor = output.ForeColor;
            output.ScrollToCaret();
        }

        private bool Confirm(string message) => MessageBox.Show(this, message, "Painel GIO", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;

        private void OpenUrl(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch (Exception ex) { Log("Não foi possível abrir o navegador: " + ex.Message, Theme.Red); }
        }

        private string AskPassword(string message)
        {
            using (var dialog = new Form { Text = "Painel GIO", FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false, ClientSize = new Size(420, 150), Font = Theme.Body })
            {
                var label = new Label { Text = message, AutoSize = false, Location = new Point(14, 12), Size = new Size(392, 44) };
                var box = new TextBox { UseSystemPasswordChar = true, Location = new Point(14, 62), Width = 392 };
                var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, Location = new Point(236, 104), Width = 80 };
                var cancel = new Button { Text = "Cancelar", DialogResult = DialogResult.Cancel, Location = new Point(326, 104), Width = 80 };
                dialog.Controls.AddRange(new Control[] { label, box, ok, cancel });
                dialog.AcceptButton = ok;
                dialog.CancelButton = cancel;
                return dialog.ShowDialog(this) == DialogResult.OK && box.Text.Length > 0 ? box.Text : null;
            }
        }

        private void ShowLogs()
        {
            Log("");
            Log("━━ Últimas linhas dos registros do servidor", Theme.Orange);
            foreach (var name in new[] { "gio-server.log", "gio-server-error.log", "gio-tunnel.log", "gio-inicio-automatico.log" })
            {
                var file = Path.Combine(gioFolder, ".logs", name);
                Log("• " + name, Color.White);
                if (!File.Exists(file)) { Log("  (arquivo ainda não existe)", Theme.Muted); continue; }
                try
                {
                    string[] lines;
                    using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (var reader = new StreamReader(stream, Encoding.UTF8))
                        lines = reader.ReadToEnd().Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
                    var tail = lines.Where(l => l.Length > 0).Skip(Math.Max(0, lines.Count(l => l.Length > 0) - 40)).ToArray();
                    if (tail.Length == 0) Log("  (vazio)", Theme.Muted);
                    foreach (var line in tail) Log("  " + line, name.Contains("error") ? Theme.Yellow : (Color?)null);
                }
                catch (Exception ex) { Log("  Não foi possível ler: " + ex.Message, Theme.Red); }
            }
        }

        private async Task ToggleAutoStart()
        {
            var exists = RunQuick("schtasks.exe", "/Query /TN \"" + TaskName + "\"").exitCode == 0;
            if (exists)
            {
                if (!Confirm("Desativar o início automático do GIO quando o Windows ligar?")) return;
                await RunAction("Desativando início automático", "schtasks.exe /Delete /TN '" + TaskName + "' /F | Out-Host; if ($LASTEXITCODE) { throw 'Falha ao remover a tarefa agendada.' }");
            }
            else
            {
                if (!Confirm("Ativar o início automático?\n\nQuando o servidor for reiniciado, o GIO liga sozinho (1 minuto depois do Windows), mesmo sem ninguém logado. Se o GIO estiver publicado na internet, o link do GitHub também é atualizado.")) return;
                var password = AskPassword("Para ligar o GIO sem ninguém logado, o Windows precisa da senha do usuário " + Environment.UserDomainName + "\\" + Environment.UserName + ".");
                if (password == null) return;
                var startScript = Path.Combine(gioFolder, "scripts", "iniciar-gio-completo.ps1");
                var command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \\\"" + startScript + "\\\"";
                var user = Environment.UserDomainName + "\\" + Environment.UserName;
                await RunAction("Ativando início automático",
                    "schtasks.exe /Create /TN '" + TaskName + "' /TR '" + command.Replace("'", "''") + "' /SC ONSTART /DELAY 0001:00 /RU '" + user.Replace("'", "''") + "' /RP '" + password.Replace("'", "''") + "' /RL HIGHEST /F | Out-Host\n" +
                    "if ($LASTEXITCODE) { throw 'Falha ao criar a tarefa agendada.' }");
            }
        }

        // ------------------------------------------------------------------ scripts
        private const string Helpers = @"
function Rodar([string]$exe, [string[]]$argumentos) {
  # Programas como git/pnpm escrevem avisos na saída de erro; isso não pode interromper o processo.
  $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $exe @argumentos 2>&1 | ForEach-Object { Write-Host ""$_"" }; $codigo = $LASTEXITCODE } finally { $ErrorActionPreference = $anterior }
  if ($codigo -ne 0) { throw ""O comando '$exe $($argumentos -join ' ')' falhou."" }
}
function Silencioso([scriptblock]$bloco) {
  $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $bloco 2>&1 | ForEach-Object { Write-Host ""$_"" } } finally { $ErrorActionPreference = $anterior }
}
function Ligar-Banco {
  $svc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $svc) { Write-Host 'Aviso: serviço do PostgreSQL não encontrado.'; return }
  if ($svc.Status -ne 'Running') { Write-Host ""==> Iniciando o PostgreSQL ($($svc.Name))...""; Start-Service $svc.Name; Start-Sleep -Seconds 3 }
  else { Write-Host ""PostgreSQL em execução ($($svc.Name)).""}
}
function Porta {
  $linha = Get-Content '.env.server' -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*GIO_PORT\s*=' } | Select-Object -First 1
  if ($linha) { return (($linha -replace '^\s*GIO_PORT\s*=\s*', '').Trim().Trim('""').Trim(""'"")) }
  return '4173'
}
function Esperar-Gio {
  $porta = Porta
  for ($i = 1; $i -le 30; $i++) {
    try { $h = Invoke-RestMethod -Uri ""http://127.0.0.1:$porta/api/health"" -TimeoutSec 3; if ($h.status -eq 'online') { Write-Host ""OK - GIO respondendo em http://127.0.0.1:$porta (Movidesk configurado: $($h.movideskConfigured))""; return } } catch { }
    Start-Sleep -Seconds 1
  }
  throw 'O GIO não respondeu em 30 segundos. Clique em ""Ver registros (logs)"" para ver o motivo.'
}
function Ligar-Gio {
  Ligar-Banco
  Write-Host '==> Ligando o servidor GIO...'
  try { & .\scripts\start-gio-server.ps1 | ForEach-Object { Write-Host ""$_"" } }
  catch { Write-Host ""Aviso: $($_.Exception.Message)""; Write-Host 'Aguardando o servidor responder...' }
  Esperar-Gio
}
function Desligar-Gio {
  Write-Host '==> Desligando o servidor GIO...'
  & .\scripts\stop-gio-server.ps1 | ForEach-Object { Write-Host ""$_"" }
}
function Backup-Banco {
  $linha = Get-Content '.env.server' -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if (-not $linha) { throw 'DATABASE_URL não encontrado no .env.server.' }
  $url = ($linha -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('""').Trim(""'"")
  $pgdump = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
    Sort-Object { [version](($_.Directory.Parent.Name -replace '[^0-9.]', '') + '.0') } -Descending | Select-Object -First 1
  if (-not $pgdump) { throw 'pg_dump.exe não encontrado (PostgreSQL não instalado nesta máquina?).' }
  $pasta = Join-Path (Get-Location) '.gio-data\backups'
  New-Item -ItemType Directory -Path $pasta -Force | Out-Null
  $arquivo = Join-Path $pasta ('gio-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
  Write-Host '==> Fazendo backup do banco...'
  Rodar $pgdump.FullName @(""--dbname=$url"", '-F', 'c', '-f', $arquivo)
  $mb = [math]::Round((Get-Item $arquivo).Length / 1MB, 2)
  Write-Host ""OK - Backup salvo: $arquivo ($mb MB)""
  Get-ChildItem $pasta -Filter 'gio-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force
}
";

        private static string StartScript() => Helpers + "\nLigar-Gio";
        private static string StopScript() => Helpers + "\nDesligar-Gio";
        private static string BackupScript() => Helpers + "\nBackup-Banco";

        private static string UpdateScript() => Helpers + @"
Write-Host '==> Conferindo alterações locais...'
$sujo = git status --porcelain --untracked-files=no
if ($sujo) { $sujo | ForEach-Object { Write-Host ""  $_"" }; throw 'Há arquivos alterados nesta pasta que não estão no Git. Faça o commit (ou descarte) antes de atualizar.' }

Write-Host '==> Consultando o GitHub...'
Rodar git @('fetch', 'origin', '--prune')
$temPostgres = git ls-tree -r --name-only origin/main -- server/db/postgres.mjs
if (-not $temPostgres) { throw 'A main do GitHub ainda não tem a versão com PostgreSQL. Faça o merge da branch ""postgres"" na main antes de atualizar por aqui.' }

$refAnterior = (git rev-parse --abbrev-ref HEAD).Trim()
$commitAnterior = (git rev-parse HEAD).Trim()
$alvo = (git rev-parse origin/main).Trim()
if ($commitAnterior -eq $alvo) { Write-Host 'OK - O GIO já está na versão mais recente da main.'; return }
Write-Host ""Versão atual: $refAnterior @ $($commitAnterior.Substring(0,7))  ->  main @ $($alvo.Substring(0,7))""
git log --oneline ""$commitAnterior..$alvo"" | Select-Object -First 15 | ForEach-Object { Write-Host ""  + $_"" }

Ligar-Banco
Backup-Banco

try {
  Desligar-Gio
  Write-Host '==> Baixando a main...'
  Rodar git @('checkout', '-B', 'main', 'origin/main')
  Write-Host '==> Instalando dependências...'
  Rodar pnpm @('install', '--config.strict-dep-builds=false')
  Write-Host '==> Compilando...'
  Rodar pnpm @('build')
  Ligar-Gio
  Write-Host ""OK - GIO atualizado para a main @ $($alvo.Substring(0,7)).""
} catch {
  $motivo = $_.Exception.Message
  Write-Host ""ERRO na atualização: $motivo""
  Write-Host '==> Voltando para a versão anterior...'
  try {
    Desligar-Gio
    if ($refAnterior -eq 'HEAD') { Silencioso { git checkout -f $commitAnterior } } else { Silencioso { git checkout -f $refAnterior }; Silencioso { git reset --hard $commitAnterior } }
    Silencioso { pnpm install --config.strict-dep-builds=false }
    Silencioso { pnpm build }
    Ligar-Gio
    Write-Host 'Versão anterior restaurada e GIO ligado.'
  } catch { Write-Host ""ERRO ao restaurar: $($_.Exception.Message). O backup do banco está em .gio-data\backups."" }
  throw ""A atualização não foi concluída: $motivo""
}
";
    }

}
