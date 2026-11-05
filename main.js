const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// Arquivo onde o estoque é salvo: Documentos\Estoque\estoque.json
function caminhoDoArquivo() {
  return path.join(app.getPath("documents"), "Estoque", "estoque.json");
}

ipcMain.handle("estoque:caminho", () => caminhoDoArquivo());

ipcMain.handle("estoque:carregar", () => {
  try {
    const arquivo = caminhoDoArquivo();
    if (!fs.existsSync(arquivo)) return null;
    return fs.readFileSync(arquivo, "utf-8");
  } catch (e) {
    return null;
  }
});

ipcMain.handle("estoque:salvar", (evento, texto) => {
  try {
    if (typeof texto !== "string") {
      return { ok: false, erro: "dados inválidos" };
    }

    const arquivo = caminhoDoArquivo();
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });

    // Grava num arquivo temporário e troca, para nunca deixar o arquivo pela metade
    const temporario = arquivo + ".tmp";
    fs.writeFileSync(temporario, texto, "utf-8");
    fs.renameSync(temporario, arquivo);

    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

// Relatório geral: o usuário escolhe onde salvar (janela "Salvar como") e o relatório abre em seguida
ipcMain.handle("estoque:relatorio", async (evento, nome, conteudo) => {
  try {
    if (typeof nome !== "string" || typeof conteudo !== "string") {
      return { ok: false, erro: "dados inválidos" };
    }

    const nomeSeguro = path.basename(nome).replace(/[^\w.\-]/g, "_");
    const pastaPadrao = path.join(app.getPath("documents"), "Estoque", "Relatorios");
    fs.mkdirSync(pastaPadrao, { recursive: true });

    const janela = BrowserWindow.fromWebContents(evento.sender);
    const escolha = await dialog.showSaveDialog(janela, {
      title: "Salvar relatório",
      defaultPath: path.join(pastaPadrao, nomeSeguro),
      filters: [{ name: "Relatório HTML", extensions: ["html"] }]
    });

    if (escolha.canceled || !escolha.filePath) {
      return { ok: false, cancelado: true };
    }

    fs.writeFileSync(escolha.filePath, conteudo, "utf-8");

    const erroAoAbrir = await shell.openPath(escolha.filePath);
    if (erroAoAbrir) {
      shell.showItemInFolder(escolha.filePath);
    }

    return { ok: true, caminho: escolha.filePath };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

// Backup em JSON: o usuário escolhe onde salvar
ipcMain.handle("estoque:backup", async (evento, nome, conteudo) => {
  try {
    if (typeof nome !== "string" || typeof conteudo !== "string") {
      return { ok: false, erro: "dados inválidos" };
    }

    const nomeSeguro = path.basename(nome).replace(/[^\w.\-]/g, "_");
    const janela = BrowserWindow.fromWebContents(evento.sender);
    const escolha = await dialog.showSaveDialog(janela, {
      title: "Salvar backup do estoque",
      defaultPath: path.join(app.getPath("documents"), nomeSeguro),
      filters: [{ name: "Backup JSON", extensions: ["json"] }]
    });

    if (escolha.canceled || !escolha.filePath) {
      return { ok: false, cancelado: true };
    }

    fs.writeFileSync(escolha.filePath, conteudo, "utf-8");
    return { ok: true, caminho: escolha.filePath };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Gestão de Estoque",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  janela.loadFile(path.join(__dirname, "products.html"));
}

app.whenReady().then(criarJanela);

app.on("window-all-closed", () => app.quit());