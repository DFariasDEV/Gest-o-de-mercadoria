var CHAVE = "estoque_produtos";

  // Abaixo deste valor o produto entra na notificação do cabeçalho
  var LIMITE_ESTOQUE_BAIXO = 50;
  var timerToast = null;

  // Lista de produtos (dados puros). Os cards são desenhados a partir dela.
  var produtos = [];
  var proximoCodigo = 1;
  var produtoEmEdicao = null;
  var produtoRenomeando = null;
  var tipoMov = "entrada";
  var produtoNoPainel = null;
  var senhaSalva = null;       // { sal, hash }
  var modoSenha = "";
  var acaoAposSenha = null;
  var produtoParaExcluir = null;
  var apenasIndisponiveis = false; // Estado do filtro de indisponíveis

  var MSG_QTD = "Digite apenas números maiores que zero (ex.: 10 ou 2,5).";

  function agora() {
    return new Date().toLocaleString("pt-BR");
  }

  /* ---------- Códigos sequenciais ---------- */

  // 1 -> "000001"
  function formatarCodigo(n) {
    return String(n).padStart(6, "0");
  }

  // Código no formato novo (só números, 6 dígitos ou mais)
  function codigoSequencial(c) {
    return /^\d{6,}$/.test(c);
  }

  // Pega o próximo código do contador
  function novoCodigo() {
    if (produtos.length === 0) {
      proximoCodigo = 1;
    } else {
      var maior = 0;
      produtos.forEach(function (p) {
        if (codigoSequencial(p.codigo)) {
          maior = Math.max(maior, Number(p.codigo));
        }
      });
      proximoCodigo = Math.max(proximoCodigo, maior + 1);
    }

    var c;
    do {
      c = formatarCodigo(proximoCodigo);
      proximoCodigo++;
    } while (produtos.some(function (p) { return p.codigo === c; }));
    return c;
  }

  /* ---------- Salvar e carregar ---------- */

  function mostrarAviso(texto) {
    document.getElementById("msgarquivo").textContent = texto;
  }

  function dadosParaSalvar() {
    return JSON.stringify({ versao: 3, proximo: proximoCodigo, senha: senhaSalva, produtos: produtos }, null, 2);
  }

  // Salva no navegador (localStorage) e, no programa, também no arquivo do PC
  function salvar() {
    var texto = dadosParaSalvar();
    var gravouLocal = true;

    try {
      localStorage.setItem(CHAVE, texto);
    } catch (e) {
      gravouLocal = false;
    }

    if (window.estoqueArquivo) {
      window.estoqueArquivo.salvar(texto).then(function (resultado) {
        if (!resultado || !resultado.ok) {
          mostrarAviso("Não foi possível salvar o arquivo: " + (resultado && resultado.erro ? resultado.erro : "erro desconhecido"));
        }
      }).catch(function () {
        mostrarAviso("Não foi possível salvar o arquivo.");
      });
    } else if (!gravouLocal) {
      mostrarAviso("Não foi possível salvar no navegador. Use o backup em arquivo.");
    }
  }

  function produtoValido(p) {
    return p && typeof p.codigo === "string" && typeof p.nome === "string" &&
           typeof p.qtd === "number" && typeof p.unidade === "string" &&
           Array.isArray(p.historico);
  }

  // Estoque zerado = indisponível
  function normalizarProduto(p) {
    p.indisponivel = !!p.indisponivel;

    if (p.qtd === 0 && !p.indisponivel) {
      p.indisponivel = true;
      p.historico.push({
        data: agora(),
        tipo: "status",
        saldo: 0,
        descricao: "Marcado como indisponível automaticamente (estoque zerado)"
      });
    } else if (p.qtd > 0 && p.indisponivel) {
      // Não existe mais o botão manual: produto com estoque fica disponível
      p.indisponivel = false;
      p.historico.push({
        data: agora(),
        tipo: "status",
        saldo: p.qtd,
        descricao: "Reativado automaticamente (tem estoque)"
      });
    }
  }

  // Aceita o formato novo ({ proximo, produtos }) e o antigo (lista simples)
  function aplicarDados(dados) {
    var lista = Array.isArray(dados) ? dados : (dados && Array.isArray(dados.produtos) ? dados.produtos : []);
    var proximoSalvo = (dados && !Array.isArray(dados) && Number(dados.proximo) > 0) ? Number(dados.proximo) : 1;

    produtos = lista.filter(produtoValido);

    senhaSalva = (dados && !Array.isArray(dados) && dados.senha && typeof dados.senha.hash === "string" && typeof dados.senha.sal === "string")
      ? { sal: dados.senha.sal, hash: dados.senha.hash }
      : null;

    var maior = 0;
    produtos.forEach(function (p) {
      if (codigoSequencial(p.codigo)) {
        maior = Math.max(maior, Number(p.codigo));
      }
    });
    proximoCodigo = Math.max(proximoSalvo, maior + 1);

    // Códigos antigos (aleatórios) viram sequenciais, na ordem da lista
    produtos.forEach(function (p) {
      if (!codigoSequencial(p.codigo)) {
        p.codigo = novoCodigo();
      }
      normalizarProduto(p);
    });
  }

  async function iniciar() {
    var dados = null;

    // 1) No programa: lê o arquivo do PC
    if (window.estoqueArquivo) {
      try {
        var texto = await window.estoqueArquivo.carregar();
        if (texto) dados = JSON.parse(texto);
      } catch (e) {
        dados = null;
      }
    }

    // 2) Sem arquivo (ou no navegador): usa o localStorage
    if (dados === null) {
      try {
        var salvo = localStorage.getItem(CHAVE);
        if (salvo) dados = JSON.parse(salvo);
      } catch (e) {
        dados = null;
      }
    }

    if (dados) aplicarDados(dados);
    render();

    if (window.estoqueArquivo) {
      salvar();
      window.estoqueArquivo.caminho().then(function (c) {
        mostrarAviso("Salvamento automático em: " + c);
      });
    }
  }

  /* ---------- Backup em arquivo ---------- */

  async function exportar() {
    var nomeBackup = "estoque-" + new Date().toISOString().slice(0, 10) + ".json";

    // No programa: abre a janela para o usuário escolher onde salvar
    if (window.estoqueArquivo && window.estoqueArquivo.salvarBackup) {
      try {
        var r = await window.estoqueArquivo.salvarBackup(nomeBackup, dadosParaSalvar());
        if (r && r.ok) {
          mostrarAviso("Backup salvo em: " + r.caminho);
        } else if (r && r.cancelado) {
          mostrarAviso("Backup cancelado: nenhum arquivo foi salvo.");
        } else {
          mostrarAviso("Não foi possível salvar o backup: " + (r && r.erro ? r.erro : "erro desconhecido"));
        }
      } catch (e) {
        mostrarAviso("Não foi possível salvar o backup. Feche o programa e abra de novo.");
      }
      return;
    }

    var blob = new Blob([dadosParaSalvar()], { type: "application/json" });
    var url = URL.createObjectURL(blob);

    var a = document.createElement("a");
    a.href = url;
    a.download = nomeBackup;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    mostrarAviso("Backup gerado com " + produtos.length + " produto(s).");
  }

  function importar(evento) {
    var input = evento.target;
    var arquivo = input.files[0];
    if (!arquivo) return;

    var leitor = new FileReader();
    leitor.onload = function () {
      try {
        var dados = JSON.parse(leitor.result);
        var lista = Array.isArray(dados) ? dados : (dados ? dados.produtos : null);
        if (!Array.isArray(lista)) throw new Error("formato");

        var novos = 0;
        var ignorados = 0;
        var renumerados = 0;

        lista.forEach(function (p) {
          if (!produtoValido(p)) {
            ignorados++;
            return;
          }

          // Mesmo código e mesmo nome: já existe, ignora
          var igual = produtos.some(function (x) { return x.codigo === p.codigo && x.nome === p.nome; });
          if (igual) {
            ignorados++;
            return;
          }

          // Código em conflito (ou no formato antigo): recebe um código novo
          var conflito = produtos.some(function (x) { return x.codigo === p.codigo; });
          if (conflito || !codigoSequencial(p.codigo)) {
            p.codigo = novoCodigo();
            renumerados++;
          }

          normalizarProduto(p);
          produtos.push(p);
          novos++;
        });

        salvar();
        render();

        mostrarAviso(novos + " produto(s) carregado(s)" +
          (renumerados ? ", " + renumerados + " com código renumerado" : "") +
          (ignorados ? ", " + ignorados + " ignorado(s) (inválidos ou já existentes)." : "."));
      } catch (e) {
        mostrarAviso("Arquivo inválido. Use um backup gerado por este sistema.");
      }
      input.value = "";
    };
    leitor.readAsText(arquivo);
  }

  /* ---------- Relatório geral do estoque (página HTML detalhada) ---------- */

  // Protege textos para entrarem no HTML do relatório
  function esc(valor) {
    return String(valor == null ? "" : valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function arred(n) {
    return Math.round(n * 1000) / 1000;
  }

  // "31/10/2026, 08:04:12" -> número, para ordenar por data
  function dataParaNumero(texto) {
    var m = String(texto || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]),
                    Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
  }

  function situacaoDoProduto(p) {
    if (p.qtd === 0) return { texto: "Sem estoque", classe: "s-zero" };
    if (p.indisponivel) return { texto: "Indisponível", classe: "s-indisp" };
    if (p.qtd < LIMITE_ESTOQUE_BAIXO) return { texto: "Estoque baixo", classe: "s-baixo" };
    return { texto: "Disponível", classe: "s-ok" };
  }

  function tipoDoMovimento(mov) {
    if (mov.tipo === "status") return { texto: "Status", classe: "t-status" };
    if (mov.descricao === "Cadastro inicial") return { texto: "Cadastro", classe: "t-entrada" };
    if (mov.tipo === "entrada") return { texto: "Entrada", classe: "t-entrada" };
    return { texto: "Saída", classe: "t-baixa" };
  }

  // Totais e datas de um produto, a partir do histórico
  function estatisticasProduto(p) {
    var e = { entradas: 0, baixas: 0, movs: 0, ultima: "", cadastro: "" };

    p.historico.forEach(function (mov) {
      if (mov.tipo === "entrada" || mov.tipo === "baixa") {
        e.movs++;
        if (mov.tipo === "entrada") e.entradas += mov.valor;
        else e.baixas += mov.valor;
        e.ultima = mov.data;
      }
      if (!e.cadastro && mov.descricao === "Cadastro inicial") e.cadastro = mov.data;
    });

    e.entradas = arred(e.entradas);
    e.baixas = arred(e.baixas);
    return e;
  }

  // Todas as movimentações de todos os produtos, das mais recentes para as mais antigas
  function coletarMovimentos() {
    var lista = [];
    var seq = 0;

    produtos.forEach(function (p) {
      p.historico.forEach(function (mov) {
        lista.push({ p: p, mov: mov, tempo: dataParaNumero(mov.data), seq: seq++ });
      });
    });

    lista.sort(function (a, b) {
      return (b.tempo - a.tempo) || (b.seq - a.seq);
    });

    return lista;
  }

  function montarRelatorio() {
    var ordenados = produtos.slice().sort(function (a, b) {
      return a.codigo < b.codigo ? -1 : (a.codigo > b.codigo ? 1 : 0);
    });
    var movimentos = coletarMovimentos();

    var stats = {};
    var totalQtd = 0, totalEntrou = 0, totalSaiu = 0, totalMovs = 0;
    var qtdDisp = 0, qtdIndisp = 0, qtdBaixo = 0, qtdZero = 0;

    ordenados.forEach(function (p) {
      var e = estatisticasProduto(p);
      stats[p.codigo] = e;

      totalQtd += p.qtd;
      totalEntrou += e.entradas;
      totalSaiu += e.baixas;
      totalMovs += e.movs;

      if (p.indisponivel) qtdIndisp++; else qtdDisp++;
      if (p.qtd === 0) qtdZero++;
      if (p.qtd < LIMITE_ESTOQUE_BAIXO) qtdBaixo++;
    });

    var baixos = ordenados
      .filter(function (p) { return p.qtd < LIMITE_ESTOQUE_BAIXO; })
      .sort(function (a, b) { return a.qtd - b.qtd; });

    var indisponiveis = ordenados.filter(function (p) { return p.indisponivel; });

    var maisSaidas = ordenados
      .filter(function (p) { return stats[p.codigo].baixas > 0; })
      .sort(function (a, b) { return stats[b.codigo].baixas - stats[a.codigo].baixas; })
      .slice(0, 5);

    /* ----- Resumo ----- */
    function cartao(titulo, valor, classe) {
      return '<div class="cartao ' + (classe || "") + '"><span>' + esc(titulo) + '</span><strong>' + esc(valor) + '</strong></div>';
    }

    var resumo =
      cartao("Produtos cadastrados", ordenados.length) +
      cartao("Quantidade total em estoque", fmt(arred(totalQtd))) +
      cartao("Disponíveis", qtdDisp, "verde") +
      cartao("Indisponíveis", qtdIndisp, "cinza") +
      cartao("Estoque baixo (menos de " + LIMITE_ESTOQUE_BAIXO + ")", qtdBaixo, "amarelo") +
      cartao("Sem estoque (zerados)", qtdZero, "vermelho") +
      cartao("Total que entrou", "+" + fmt(arred(totalEntrou)), "verde") +
      cartao("Total que saiu", "-" + fmt(arred(totalSaiu)), "vermelho") +
      cartao("Movimentações (entradas e saídas)", totalMovs);

    /* ----- Tabela de produtos ----- */
    var linhasProdutos = ordenados.map(function (p) {
      var e = stats[p.codigo];
      var s = situacaoDoProduto(p);
      return "<tr>" +
        "<td class='cod'>" + esc(p.codigo) + "</td>" +
        "<td>" + esc(p.nome) + "</td>" +
        "<td class='num'><strong>" + esc(comUnidade(p.qtd, p.unidade)) + "</strong></td>" +
        "<td><span class='etiqueta " + s.classe + "'>" + s.texto + "</span></td>" +
        "<td class='num verde-txt'>+" + esc(fmt(e.entradas)) + "</td>" +
        "<td class='num vermelho-txt'>-" + esc(fmt(e.baixas)) + "</td>" +
        "<td class='num'>" + e.movs + "</td>" +
        "<td>" + esc(e.cadastro || "-") + "</td>" +
        "<td>" + esc(e.ultima || "-") + "</td>" +
        "</tr>";
    }).join("");

    var tabelaProdutos = ordenados.length === 0
      ? "<p class='vazio'>Nenhum produto cadastrado.</p>"
      : "<table><thead><tr>" +
          "<th>Código</th><th>Produto</th><th>Quantidade</th><th>Situação</th>" +
          "<th>Entradas</th><th>Saídas</th><th>Mov.</th><th>Cadastrado em</th><th>Última movimentação</th>" +
          "</tr></thead><tbody>" + linhasProdutos + "</tbody>" +
          "<tfoot><tr><td colspan='2'>TOTAL</td><td class='num'>" + esc(fmt(arred(totalQtd))) + "</td><td></td>" +
          "<td class='num'>+" + esc(fmt(arred(totalEntrou))) + "</td>" +
          "<td class='num'>-" + esc(fmt(arred(totalSaiu))) + "</td>" +
          "<td class='num'>" + totalMovs + "</td><td></td><td></td></tr></tfoot></table>" +
          "<p class='nota'>As entradas incluem a quantidade do cadastro inicial. Entradas menos saídas é igual à quantidade atual. " +
          "Os totais somam apenas os números, sem considerar a unidade de cada produto.</p>";

    /* ----- Atenção ----- */
    function listaSimples(lista, textoVazio, formato) {
      if (lista.length === 0) return "<p class='vazio'>" + textoVazio + "</p>";
      return "<ul>" + lista.map(function (p) { return "<li>" + formato(p) + "</li>"; }).join("") + "</ul>";
    }

    var blocoBaixos = listaSimples(baixos, "Nenhum produto com estoque baixo.", function (p) {
      return "<span class='cod'>" + esc(p.codigo) + "</span> " + esc(p.nome) +
             " <strong>(" + esc(comUnidade(p.qtd, p.unidade)) + ")</strong>";
    });

    var blocoIndisp = listaSimples(indisponiveis, "Nenhum produto indisponível.", function (p) {
      return "<span class='cod'>" + esc(p.codigo) + "</span> " + esc(p.nome) +
             " <strong>(" + esc(comUnidade(p.qtd, p.unidade)) + ")</strong>";
    });

    var blocoSaidas = listaSimples(maisSaidas, "Ainda não houve saídas.", function (p) {
      return "<span class='cod'>" + esc(p.codigo) + "</span> " + esc(p.nome) +
             " <strong class='vermelho-txt'>-" + esc(fmt(stats[p.codigo].baixas)) + "</strong>";
    });

    /* ----- Movimentações ----- */
    var linhasMovs = movimentos.map(function (item) {
      var p = item.p;
      var mov = item.mov;
      var t = tipoDoMovimento(mov);

      var quantidade = "-";
      if (mov.tipo === "entrada") quantidade = "<span class='verde-txt'>+" + esc(fmt(mov.valor)) + "</span>";
      if (mov.tipo === "baixa") quantidade = "<span class='vermelho-txt'>-" + esc(fmt(mov.valor)) + "</span>";

      return "<tr>" +
        "<td>" + esc(mov.data) + "</td>" +
        "<td class='cod'>" + esc(p.codigo) + "</td>" +
        "<td>" + esc(p.nome) + "</td>" +
        "<td><span class='etiqueta " + t.classe + "'>" + t.texto + "</span></td>" +
        "<td class='num'>" + quantidade + "</td>" +
        "<td class='num'>" + esc(comUnidade(mov.saldo, p.unidade)) + "</td>" +
        "<td>" + esc(mov.tipo === "status" ? mov.descricao : (mov.descricao === "Cadastro inicial" ? "Cadastro inicial" : "")) + "</td>" +
        "</tr>";
    }).join("");

    var tabelaMovs = movimentos.length === 0
      ? "<p class='vazio'>Nenhuma movimentação registrada.</p>"
      : "<table><thead><tr>" +
          "<th>Data e hora</th><th>Código</th><th>Produto</th><th>Tipo</th>" +
          "<th>Quantidade</th><th>Saldo depois</th><th>Observação</th>" +
          "</tr></thead><tbody>" + linhasMovs + "</tbody></table>";

    /* ----- Página ----- */
    var estilo =
      "body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;background:#f4f4f4;}" +
      ".pagina{max-width:1100px;margin:0 auto;padding:20px;background:white;}" +
      "header{background:green;color:white;padding:16px 20px;border-radius:8px;}" +
      "header h1{margin:0;font-size:24px;}" +
      "header p{margin:6px 0 0 0;}" +
      "h2{color:green;border-bottom:2px solid green;padding-bottom:4px;margin-top:30px;}" +
      ".cartoes{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;}" +
      ".cartao{background:#ecebeb;border:2px solid #555;border-radius:10px;padding:10px;}" +
      ".cartao span{display:block;font-size:13px;color:#555;}" +
      ".cartao strong{display:block;font-size:24px;margin-top:4px;}" +
      ".cartao.verde{border-color:green;}.cartao.vermelho{border-color:#b52b27;}" +
      ".cartao.amarelo{border-color:#e69a1f;}.cartao.cinza{border-color:#999;}" +
      "table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px;}" +
      "th{background:green;color:white;text-align:left;padding:6px 8px;}" +
      "td{padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top;}" +
      "tbody tr:nth-child(even){background:#f7f7f7;}" +
      "tfoot td{font-weight:bold;background:#ecebeb;border-top:2px solid #555;}" +
      ".num{text-align:right;white-space:nowrap;}" +
      ".cod{font-family:'Courier New',monospace;color:#555;}" +
      ".verde-txt{color:green;font-weight:bold;}.vermelho-txt{color:#d00000;font-weight:bold;}" +
      ".etiqueta{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:bold;color:white;}" +
      ".s-ok,.t-entrada{background:#3eac3e;}.s-baixo{background:#e69a1f;}" +
      ".s-indisp{background:#777;}.s-zero,.t-baixa{background:#d9534f;}.t-status{background:#e69a1f;}" +
      ".colunas{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;}" +
      ".colunas h3{margin:0 0 6px 0;}" +
      "ul{margin:0;padding-left:20px;}li{margin:4px 0;}" +
      ".vazio{color:#777;font-style:italic;}.nota{font-size:12px;color:#666;}" +
      ".imprimir{float:right;background:white;color:green;border:none;border-radius:6px;padding:8px 14px;font-weight:bold;cursor:pointer;}" +
      "@media print{body{background:white;}.imprimir{display:none;}.pagina{padding:0;max-width:none;}" +
      "tr{page-break-inside:avoid;}h2{page-break-after:avoid;}}";

    return "<!DOCTYPE html><html lang='pt-br'><head><meta charset='UTF-8'>" +
      "<meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
      "<title>Relatório de estoque</title><style>" + estilo + "</style></head><body><div class='pagina'>" +
      "<header><button class='imprimir' onclick='window.print()'>Imprimir / Salvar como PDF</button>" +
      "<h1>RELATÓRIO GERAL DE ESTOQUE</h1><p>Gerado em " + esc(agora()) + "</p></header>" +

      "<h2>Resumo geral</h2><div class='cartoes'>" + resumo + "</div>" +

      "<h2>Produtos em estoque</h2>" + tabelaProdutos +

      "<h2>Atenção</h2><div class='colunas'>" +
        "<div><h3>Estoque baixo (menos de " + LIMITE_ESTOQUE_BAIXO + ")</h3>" + blocoBaixos + "</div>" +
        "<div><h3>Indisponíveis</h3>" + blocoIndisp + "</div>" +
        "<div><h3>Produtos com mais saídas (top 5)</h3>" + blocoSaidas + "</div>" +
      "</div>" +

      "<h2>Movimentações (mais recentes primeiro)</h2>" + tabelaMovs +

      "<p class='nota'>Produtos excluídos não aparecem neste relatório.</p>" +
      "</div></body></html>";
  }

  function nomeDoRelatorio() {
    var d = new Date();
    function dois(n) { return String(n).padStart(2, "0"); }
    return "relatorio-estoque-" + d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate()) +
           "_" + dois(d.getHours()) + "-" + dois(d.getMinutes()) + ".html";
  }

  async function gerarRelatorio() {
    if (produtos.length === 0) {
      mostrarAviso("Não há produtos cadastrados para gerar o relatório.");
      return;
    }

    var conteudo = montarRelatorio();
    var nome = nomeDoRelatorio();

    // No programa: abre a janela para o usuário escolher onde salvar
    if (window.estoqueArquivo && window.estoqueArquivo.salvarRelatorio) {
      try {
        var r = await window.estoqueArquivo.salvarRelatorio(nome, conteudo);
        if (r && r.ok) {
          mostrarAviso("Relatório salvo em: " + r.caminho);
        } else if (r && r.cancelado) {
          mostrarAviso("Relatório cancelado: nenhum arquivo foi salvo.");
        } else {
          mostrarAviso("Não foi possível salvar o relatório: " + (r && r.erro ? r.erro : "erro desconhecido"));
        }
      } catch (e) {
        mostrarAviso("Não foi possível salvar o relatório. Feche o programa e abra de novo.");
      }
      return;
    }

    // No navegador: baixa o arquivo
    var blob = new Blob([conteudo], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);

    var a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    mostrarAviso("Relatório gerado: " + nome);
  }

  /* ---------- Notificação de estoque baixo ---------- */

  function atualizarAlerta() {
    var notificacao = document.getElementById("notificacao");
    var painel = document.getElementById("painelalerta");

    // Produtos abaixo do limite, do mais crítico para o menos
    var baixos = produtos
      .filter(function (p) { return p.qtd < LIMITE_ESTOQUE_BAIXO; })
      .sort(function (a, b) { return a.qtd - b.qtd; });

    if (baixos.length === 0) {
      notificacao.style.display = "none";
      painel.style.display = "none";
      return;
    }

    notificacao.style.display = "block";
    document.getElementById("contadoralerta").textContent = baixos.length;

    painel.innerHTML = "";

    var titulo = document.createElement("strong");
    titulo.textContent = "Estoque baixo (menos de " + LIMITE_ESTOQUE_BAIXO + ")";
    painel.appendChild(titulo);

    baixos.forEach(function (p) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "alerta-item";
      item.textContent = p.nome + " (" + comUnidade(p.qtd, p.unidade) + ")";
      item.title = "Clique para localizar o produto";
      item.onclick = function () {
        // Tira o filtro de indisponíveis, se estiver ligado, para o card aparecer
        if (apenasIndisponiveis) alternarFiltroIndisponiveis();
        document.getElementById("busca").value = p.codigo;
        filtrar();
        painel.style.display = "none";
      };
      painel.appendChild(item);
    });
  }

  function alternarPainelAlerta() {
    var painel = document.getElementById("painelalerta");
    document.getElementById("toastalerta").style.display = "none";
    painel.style.display = painel.style.display === "none" ? "block" : "none";
  }

  function fecharPainelAlerta() {
    document.getElementById("painelalerta").style.display = "none";
  }

  // Aviso curto (5 segundos) quando um produto fica abaixo do limite
  function mostrarToast(texto) {
    var t = document.getElementById("toastalerta");
    t.textContent = texto;
    t.style.display = "block";

    clearTimeout(timerToast);
    timerToast = setTimeout(function () {
      t.style.display = "none";
    }, 5000);
  }

  /* ---------- Busca e Filtros ---------- */

  // Tira acentos e deixa em maiúsculas para comparar ("Café" -> "CAFE")
  function normalizar(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  }

  // Mostra ou esconde produtos com base na busca e no botão de indisponíveis
  function filtrar() {
    var termoOriginal = document.getElementById("busca").value.trim();
    var termo = normalizar(termoOriginal);
    var cards = document.querySelectorAll("#produtosq .card");
    var achou = 0;

    cards.forEach(function (c) {
      var combinaTermo = termo === "" ||
        normalizar(c.dataset.codigo).indexOf(termo) !== -1 ||
        normalizar(c.dataset.nome).indexOf(termo) !== -1;

      // Verifica se atende também ao filtro de indisponíveis
      var indisponivel = c.classList.contains("indisponivel");
      var combinaIndisponivel = !apenasIndisponiveis || indisponivel;

      var combina = combinaTermo && combinaIndisponivel;

      c.style.display = combina ? "" : "none";
      if (combina) achou++;
    });

    var msg = document.getElementById("msgbusca");
    if ((termo !== "" || apenasIndisponiveis) && achou === 0) {
      msg.textContent = 'Nenhum produto encontrado.';
    } else {
      msg.textContent = "";
    }
  }

  function limparBusca() {
    document.getElementById("busca").value = "";
    apenasIndisponiveis = false;
    document.getElementById("btnFiltroIndisponiveis").style.backgroundColor = "";
    document.getElementById("btnFiltroIndisponiveis").style.color = "";
    document.getElementById("btnFiltroIndisponiveis").textContent = "Ver indisponíveis";
    filtrar();
    document.getElementById("busca").focus();
  }

  // Ativa ou desativa o filtro de apenas indisponíveis
  function alternarFiltroIndisponiveis() {
    apenasIndisponiveis = !apenasIndisponiveis;
    var btn = document.getElementById("btnFiltroIndisponiveis");

    if (apenasIndisponiveis) {
      btn.style.backgroundColor = "#d9534f"; // Cor vermelha para indicar que está ativo
      btn.style.color = "white";
      btn.textContent = "Ver todos";
    } else {
      btn.style.backgroundColor = "";
      btn.style.color = "";
      btn.textContent = "Ver indisponíveis";
    }

    filtrar();
  }

  /* ---------- Quantidades ---------- */

  // Aceita só números: 10, 2,5 ou 2.5
  function lerQuantidade(texto) {
    texto = texto.trim();
    if (!/^\d+(?:[.,]\d+)?$/.test(texto)) return null;

    var numero = parseFloat(texto.replace(",", "."));
    if (!(numero > 0)) return null;

    return { numero: numero, unidade: "" };
  }

  // Mostra o número com vírgula (2.5 -> 2,5)
  function fmt(n) {
    return String(n).replace(".", ",");
  }

  // Número + unidade, ex.: "10 caixas" (produtos antigos podem ter unidade)
  function comUnidade(n, unidade) {
    return fmt(n) + (unidade ? " " + unidade : "");
  }

  // Aplica uma entrada ou baixa ao produto, guarda no histórico e salva
  function registrar(p, tipo, valor, descricao) {
    var antes = p.qtd;
    var novo = tipo === "entrada" ? p.qtd + valor : p.qtd - valor;
    p.qtd = Math.round(novo * 1000) / 1000;

    p.historico.push({
      data: agora(),
      tipo: tipo,
      valor: valor,
      saldo: p.qtd,
      descricao: descricao
    });

    if (p.qtd === 0 && !p.indisponivel) {
      // Estoque zerado: fica indisponível automaticamente
      p.indisponivel = true;
      p.historico.push({
        data: agora(),
        tipo: "status",
        saldo: p.qtd,
        descricao: "Marcado como indisponível automaticamente (estoque zerado)"
      });
    } else if (tipo === "entrada" && antes === 0 && p.indisponivel) {
      // Chegou estoque novo: volta a ficar disponível
      p.indisponivel = false;
      p.historico.push({
        data: agora(),
        tipo: "status",
        saldo: p.qtd,
        descricao: "Reativado automaticamente (nova entrada)"
      });
    }

    // Notifica quando uma baixa leva o produto para abaixo do limite,
    // ou quando ele já é cadastrado abaixo do limite
    var cruzouLimite = (tipo === "baixa" && antes >= LIMITE_ESTOQUE_BAIXO && p.qtd < LIMITE_ESTOQUE_BAIXO) ||
                       (descricao === "Cadastro inicial" && p.qtd < LIMITE_ESTOQUE_BAIXO);

    salvar();
    render();

    if (cruzouLimite) {
      mostrarToast("⚠ " + p.nome + " está com estoque baixo: " + comUnidade(p.qtd, p.unidade));
    }
  }

  /* ---------- Cards ---------- */

  function criarCard(p) {
    var card = document.createElement("div");
    card.className = "card" + (p.indisponivel ? " indisponivel" : "");
    card.dataset.codigo = p.codigo;
    card.dataset.nome = p.nome;

    var titulo = document.createElement("h3");
    titulo.textContent = p.nome;

    var codigoTexto = document.createElement("p");
    codigoTexto.className = "codigo-produto";
    codigoTexto.textContent = "Cód: " + p.codigo;

    var selo = document.createElement("span");
    selo.className = "selo-indisponivel";
    selo.textContent = "INDISPONÍVEL";

    var quantidade = document.createElement("p");
    quantidade.textContent = comUnidade(p.qtd, p.unidade);

    var entrada = document.createElement("button");
    entrada.textContent = "Entrada";
    entrada.onclick = function () {
      abrirModal(p, "entrada");
    };

    var saida = document.createElement("button");
    saida.textContent = "Saída";
    saida.disabled = p.qtd === 0; // sem estoque, não há o que tirar
    saida.onclick = function () {
      abrirModal(p, "baixa");
    };

    var renomear = document.createElement("button");
    renomear.textContent = "Editar nome";
    renomear.onclick = function () {
      abrirNome(p);
    };

    var verHistorico = document.createElement("button");
    verHistorico.textContent = "Histórico";
    verHistorico.onclick = function () {
      abrirHistorico(p);
    };

    var excluir = document.createElement("button");
    excluir.textContent = "Excluir";
    excluir.className = "excluir";
    excluir.onclick = function () {
      abrirExcluir(p);
    };

    card.appendChild(titulo);
    card.appendChild(codigoTexto);
    card.appendChild(selo);
    card.appendChild(quantidade);
    card.appendChild(entrada);
    card.appendChild(saida);
    card.appendChild(renomear);
    card.appendChild(verHistorico);
    card.appendChild(excluir);

    return card;
  }

  // Redesenha todos os cards a partir da lista de produtos (mais recentes primeiro)
  function render() {
    var area = document.getElementById("produtosq");
    area.innerHTML = "";

    for (var i = produtos.length - 1; i >= 0; i--) {
      area.appendChild(criarCard(produtos[i]));
    }

    atualizarAlerta();
    filtrar();

    // Se a aba lateral está aberta, mantém a lista atualizada
    if (produtoNoPainel) {
      if (produtos.indexOf(produtoNoPainel) === -1) fecharHistorico();
      else preencherPainel();
    }
  }

  /* ---------- Senha ---------- */

  function hashSimples(texto) {
    var x = 5381;
    for (var i = 0; i < texto.length; i++) {
      x = ((x << 5) + x + texto.charCodeAt(i)) >>> 0;
    }
    return x.toString(16);
  }

  async function gerarHash(senha, sal) {
    var texto = sal + ":" + senha;
    try {
      if (window.crypto && window.crypto.subtle) {
        var buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
        return Array.from(new Uint8Array(buf)).map(function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
      }
    } catch (e) {}
    return "s" + hashSimples(texto);
  }

  async function conferirSenha(senha) {
    if (!senhaSalva) return false;
    return (await gerarHash(senha, senhaSalva.sal)) === senhaSalva.hash;
  }

  async function guardarSenha(senha) {
    var sal = String(Date.now()) + Math.random().toString(16).slice(2);
    senhaSalva = { sal: sal, hash: await gerarHash(senha, sal) };
    salvar();
  }

  function mostrarCampo(id, visivel) {
    document.getElementById(id).style.display = visivel ? "" : "none";
  }

  // Abre a janela de senha. aoConfirmar roda só se a senha estiver certa.
  function pedirSenha(titulo, aoConfirmar, alterar) {
    modoSenha = alterar ? "alterar" : (senhaSalva ? "verificar" : "criar");
    acaoAposSenha = aoConfirmar || null;

    document.getElementById("senhatitulo").textContent = modoSenha === "criar" ? "Criar senha" : titulo;
    document.getElementById("senhanota").textContent = modoSenha === "criar"
      ? "Primeiro uso: crie uma senha. Ela será pedida para registrar produtos e dar entrada no estoque."
      : "";

    document.getElementById("labelatual").textContent = modoSenha === "alterar" ? "Senha atual:" : "Senha:";
    document.getElementById("labelnova").textContent = modoSenha === "alterar" ? "Nova senha:" : "Crie uma senha:";

    mostrarCampo("campoatual", modoSenha !== "criar");
    mostrarCampo("camponova", modoSenha !== "verificar");
    mostrarCampo("camporepetir", modoSenha !== "verificar");

    ["senhaatual", "senhanova", "senharepetir"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    document.getElementById("erro-senha").textContent = "";

    document.getElementById("modalsenha").classList.add("aberto");
    document.getElementById(modoSenha === "criar" ? "senhanova" : "senhaatual").focus();
  }

  function alterarSenha() {
    if (!senhaSalva) {
      pedirSenha("Criar senha", null);
    } else {
      pedirSenha("Alterar senha", null, true);
    }
  }

  async function confirmarSenha() {
    var erro = document.getElementById("erro-senha");
    var atual = document.getElementById("senhaatual").value;
    var nova = document.getElementById("senhanova").value;
    var repetir = document.getElementById("senharepetir").value;

    if (modoSenha !== "criar" && !(await conferirSenha(atual))) {
      erro.textContent = "Senha incorreta.";
      return;
    }

    var criouOuMudou = false;
    if (modoSenha !== "verificar") {
      if (nova.length < 4) {
        erro.textContent = "A senha precisa ter pelo menos 4 caracteres.";
        return;
      }
      if (nova !== repetir) {
        erro.textContent = "As senhas não são iguais.";
        return;
      }
      await guardarSenha(nova);
      criouOuMudou = true;
    }

    var acao = acaoAposSenha;
    var foiAlteracao = modoSenha === "alterar";
    fecharSenha();

    if (foiAlteracao) mostrarAviso("Senha alterada.");
    else if (criouOuMudou && !acao) mostrarAviso("Senha criada.");

    if (acao) acao();
  }

  function fecharSenha() {
    document.getElementById("modalsenha").classList.remove("aberto");
    acaoAposSenha = null;
  }

  /* ---------- Cadastro ---------- */

  function adicionar() {
    var nomedoproduto = document.getElementById("nomedoproduto").value.trim();
    var quantidadeproduto = document.getElementById("quantidadeproduto").value.trim();
    var mensagemerro = document.getElementById("mensagemerro");

    if (nomedoproduto === "") {
      mensagemerro.textContent = "Preencha o nome do produto!";
      return;
    }

    var lida = lerQuantidade(quantidadeproduto);
    if (!lida) {
      mensagemerro.textContent = MSG_QTD;
      return;
    }

    mensagemerro.textContent = "";

    // Só registra depois de confirmar a senha
    pedirSenha("Senha para registrar", function () {
      var p = {
        codigo: novoCodigo(),
        nome: nomedoproduto,
        qtd: 0,
        unidade: lida.unidade,
        historico: [],
        indisponivel: false
      };

      produtos.push(p);
      registrar(p, "entrada", lida.numero, "Cadastro inicial");

      document.getElementById("nomedoproduto").value = "";
      document.getElementById("quantidadeproduto").value = "";
    });
  }

  /* ---------- Entrada e saída ---------- */

  function abrirModal(p, tipo) {
    produtoEmEdicao = p;
    tipoMov = tipo;

    var ehEntrada = tipo === "entrada";
    document.getElementById("modaltitulo").textContent = ehEntrada ? "Dar entrada" : "Dar saída";
    document.getElementById("modalproduto").textContent =
      p.nome + " [" + p.codigo + "] (estoque atual: " + comUnidade(p.qtd, p.unidade) + ")";

    var botao = document.getElementById("btnconfirmarmov");
    botao.textContent = ehEntrada ? "Confirmar entrada" : "Confirmar saída";
    botao.className = ehEntrada ? "btn-entrada" : "btn-baixa";

    document.getElementById("movqtd").value = "";
    document.getElementById("erroedicao").textContent = "";
    document.getElementById("modal").classList.add("aberto");
    document.getElementById("movqtd").focus();
  }

  function fecharModal() {
    document.getElementById("modal").classList.remove("aberto");
    produtoEmEdicao = null;
  }

  function confirmarMovimento() {
    var texto = document.getElementById("movqtd").value.trim();
    var erro = document.getElementById("erroedicao");

    var lida = lerQuantidade(texto);
    if (!lida) {
      erro.textContent = MSG_QTD;
      return;
    }

    var p = produtoEmEdicao;
    var tipo = tipoMov;
    var valor = lida.numero;

    if (!p) return;

    if (tipo === "baixa" && valor > p.qtd) {
      erro.textContent = "Estoque insuficiente! Atual: " + comUnidade(p.qtd, p.unidade) + ".";
      return;
    }

    function executar() {
      registrar(p, tipo, valor, tipo === "entrada" ? "Entrada" : "Saída");
      fecharModal();
    }

    // Entrada exige senha; saída não
    if (tipo === "entrada") {
      pedirSenha("Senha para dar entrada", executar);
    } else {
      executar();
    }
  }

  /* ---------- Editar nome ---------- */

  function abrirNome(p) {
    produtoRenomeando = p;
    document.getElementById("nomeatual").textContent = "Produto " + p.codigo + ": " + p.nome;
    document.getElementById("novonome").value = p.nome;
    document.getElementById("erronome").textContent = "";
    document.getElementById("modalnome").classList.add("aberto");
    document.getElementById("novonome").focus();
    document.getElementById("novonome").select();
  }

  function fecharNome() {
    document.getElementById("modalnome").classList.remove("aberto");
    produtoRenomeando = null;
  }

  function confirmarNome() {
    var p = produtoRenomeando;
    var erro = document.getElementById("erronome");
    var novo = document.getElementById("novonome").value.trim();

    if (!p) return;

    if (novo === "") {
      erro.textContent = "Digite o novo nome do produto.";
      return;
    }

    if (novo === p.nome) {
      erro.textContent = "O novo nome é igual ao atual.";
      return;
    }

    // Só muda o nome depois de confirmar a senha
    pedirSenha("Senha para editar o nome", function () {
      p.nome = novo;
      salvar();
      render();
      fecharNome();
      mostrarAviso("Nome alterado para: " + novo);
    });
  }

  /* ---------- Histórico (aba lateral) ---------- */

  function trocarAba(aba) {
    var mov = aba === "mov";
    document.getElementById("listamov").style.display = mov ? "" : "none";
    document.getElementById("listastatus").style.display = mov ? "none" : "";
    document.getElementById("abamov").className = mov ? "ativa" : "";
    document.getElementById("abastatus").className = mov ? "" : "ativa";
  }

  function itemVazio(texto) {
    var li = document.createElement("li");
    li.className = "vazio";
    li.textContent = texto;
    return li;
  }

  function itemHistorico(mov, p) {
    var item = document.createElement("li");

    var data = document.createElement("strong");
    data.textContent = mov.data;

    var valor = document.createElement("span");
    var detalhe = document.createElement("span");
    detalhe.className = "mov-detalhe";

    if (mov.tipo === "status") {
      valor.className = "mov-status";
      valor.textContent = "●";
    } else {
      valor.className = mov.tipo === "entrada" ? "mov-entrada" : "mov-baixa";
      valor.textContent = (mov.tipo === "entrada" ? "+" : "-") + comUnidade(mov.valor, p.unidade);
    }

    detalhe.textContent = mov.descricao + " | Saldo: " + comUnidade(mov.saldo, p.unidade);

    item.appendChild(data);
    item.appendChild(document.createElement("br"));
    item.appendChild(valor);
    item.appendChild(detalhe);
    return item;
  }

  function preencherPainel() {
    var p = produtoNoPainel;
    document.getElementById("histtitulo").textContent = "Histórico: " + p.nome + " [" + p.codigo + "]";

    var listaMov = document.getElementById("listamov");
    var listaStatus = document.getElementById("listastatus");
    listaMov.innerHTML = "";
    listaStatus.innerHTML = "";

    // Do mais recente para o mais antigo
    for (var i = p.historico.length - 1; i >= 0; i--) {
      var mov = p.historico[i];
      (mov.tipo === "status" ? listaStatus : listaMov).appendChild(itemHistorico(mov, p));
    }

    if (!listaMov.firstChild) listaMov.appendChild(itemVazio("Nenhuma entrada ou saída ainda."));
    if (!listaStatus.firstChild) listaStatus.appendChild(itemVazio("O produto nunca ficou indisponível."));
  }

  function abrirHistorico(p) {
    produtoNoPainel = p;
    preencherPainel();
    trocarAba("mov");

    var painel = document.getElementById("painellateral");
    painel.classList.add("aberto");
    painel.setAttribute("aria-hidden", "false");
  }

  function fecharHistorico() {
    var painel = document.getElementById("painellateral");
    painel.classList.remove("aberto");
    painel.setAttribute("aria-hidden", "true");
    produtoNoPainel = null;
  }

  /* ---------- Excluir ---------- */

  function abrirExcluir(p) {
    produtoParaExcluir = p;
    document.getElementById("excluirtexto").textContent =
      'Tem certeza que deseja excluir "' + p.nome + '"? O histórico dele também será apagado.';
    document.getElementById("modalexcluir").classList.add("aberto");
  }

  function fecharExcluir() {
    document.getElementById("modalexcluir").classList.remove("aberto");
    produtoParaExcluir = null;
  }

  function confirmarExclusao() {
    if (produtoParaExcluir) {
      var alvo = produtoParaExcluir;
      produtos = produtos.filter(function (x) { return x !== alvo; });
      salvar();
      render();
    }
    fecharExcluir();
  }

  /* ---------- Fechar janelas ---------- */

  // Fecha clicando no fundo escuro ou apertando Esc
  document.getElementById("modal").addEventListener("click", function (e) {
    if (e.target === this) fecharModal();
  });

  document.getElementById("modalnome").addEventListener("click", function (e) {
    if (e.target === this) fecharNome();
  });

  document.getElementById("novonome").addEventListener("keydown", function (e) {
    if (e.key === "Enter") confirmarNome();
  });

  document.getElementById("modalsenha").addEventListener("click", function (e) {
    if (e.target === this) fecharSenha();
  });

  // Enter confirma nas janelas de quantidade e de senha
  document.getElementById("movqtd").addEventListener("keydown", function (e) {
    if (e.key === "Enter") confirmarMovimento();
  });

  ["senhaatual", "senhanova", "senharepetir"].forEach(function (id) {
    document.getElementById(id).addEventListener("keydown", function (e) {
      if (e.key === "Enter") confirmarSenha();
    });
  });

  document.getElementById("modalexcluir").addEventListener("click", function (e) {
    if (e.target === this) fecharExcluir();
  });

  // Fecha o painel da notificação clicando fora dele
  document.addEventListener("click", function (e) {
    if (!document.getElementById("notificacao").contains(e.target)) {
      fecharPainelAlerta();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (document.getElementById("modalsenha").classList.contains("aberto")) {
        fecharSenha();
        return;
      }
      fecharModal();
      fecharNome();
      fecharHistorico();
      fecharExcluir();
      fecharPainelAlerta();
    }
  });

  /* ---------- Campos de quantidade: só números ---------- */

  function somenteNumeros(e) {
    e.target.value = e.target.value.replace(/[^\d.,]/g, "");
  }

  ["quantidadeproduto", "movqtd"].forEach(function (id) {
    var campo = document.getElementById(id);
    campo.setAttribute("inputmode", "decimal");
    campo.addEventListener("input", somenteNumeros);
  });

  /* ---------- Início ---------- */

  iniciar();