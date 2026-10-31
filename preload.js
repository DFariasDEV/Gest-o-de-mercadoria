const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("estoqueArquivo", {
  carregar: () => ipcRenderer.invoke("estoque:carregar"),
  salvar: (texto) => ipcRenderer.invoke("estoque:salvar", texto),
  caminho: () => ipcRenderer.invoke("estoque:caminho"),
  salvarRelatorio: (nome, conteudo) => ipcRenderer.invoke("estoque:relatorio", nome, conteudo)
});