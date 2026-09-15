/* =====================================================================
   CARWAY v11 — COMPLEMENTOS

   Este arquivo é carregado DEPOIS do script.js e traz:

     1. Offline.salvarComFallback  — função que o app CHAMA mas que
        NUNCA FOI ESCRITA. Sem ela, salvar abastecimento, manutenção
        e despesa quebra com "Offline.salvarComFallback is not a
        function". Esta é a correção.

     2. Offline.sincronizarPendentes — implementação real. No arquivo
        antigo era só um aviso ("será ativada na próxima atualização").

     3. Instalador — faixa e guia de instalação do PWA.

     4. bootApp — versão que lê a URL direta, sem google.script.url.

   Ordem no index.html:
     carway-config.js  →  script.js  →  carway-extra.js
   ===================================================================== */

/* Mantém front e backend alinhados (evita o toast de "atualize os arquivos") */
var VERSAO_FRONT = 11;


/* =====================================================================
   1 e 2 — FILA OFFLINE
   ===================================================================== */

/**
 * Identificador curto para cada item da fila.
 */
Offline._novoId = function () {
  return 'p' + Date.now().toString(36) +
         Math.random().toString(36).substring(2, 7);
};

/**
 * Decide se o erro foi de REDE (vale enfileirar) ou de REGRA
 * (não adianta repetir — precisa avisar o usuário).
 *
 * Erros de regra vêm do próprio servidor: limite de plano, perfil
 * sem permissão, campo inválido. Repetir não resolve.
 */
Offline._ehFalhaDeRede = function (erro) {
  if (!navigator.onLine) return true;

  var m = String((erro && erro.message) || erro || '').toLowerCase();

  return m.indexOf('failed to fetch') > -1 ||
         m.indexOf('sem internet') > -1 ||
         m.indexOf('networkerror') > -1 ||
         m.indexOf('não consegui falar com o servidor') > -1 ||
         m.indexOf('nao consegui falar com o servidor') > -1 ||
         m.indexOf('o servidor não respondeu') > -1 ||
         m.indexOf('o servidor nao respondeu') > -1 ||
         m.indexOf('demorou') > -1;
};

/**
 * Salva no servidor. Se a internet falhar, guarda na fila local e
 * devolve sucesso "otimista", para o app seguir funcionando.
 *
 * Chamada por App.formAbastecimento, App.formManutencao e
 * App.formDespesa.
 *
 * @param {string} tabela   Abastecimentos | Manutencoes | Despesas
 * @param {Object} registro Dados a gravar
 * @param {string} resumo   Texto curto para a tela de pendentes
 */
Offline.salvarComFallback = function (tabela, registro, resumo) {

  /* Já está offline: nem tenta a rede */
  if (!navigator.onLine) {
    return Promise.resolve(
      Offline._enfileirar(tabela, registro, resumo, '')
    );
  }

  return api('salvar', tabela, registro)
    .then(function (r) {
      /* Deu certo online. Se havia pendentes, aproveita a janela
         de conexão para tentar enviá-los também. */
      if (Offline._pendentes.length) {
        setTimeout(Offline.sincronizarPendentes, 800);
      }
      return r;
    })
    .catch(function (e) {

      /* Erro de regra do servidor: não enfileira, devolve o erro
         para o formulário mostrar a mensagem certa. */
      if (!Offline._ehFalhaDeRede(e)) {
        throw e;
      }

      return Offline._enfileirar(
        tabela, registro, resumo,
        (e && e.message) ? e.message : ''
      );
    });
};

/**
 * Coloca o registro na fila local e devolve uma resposta no mesmo
 * formato de api('salvar'), para não quebrar quem chamou.
 */
Offline._enfileirar = function (tabela, registro, resumo, erro) {

  var item = {
    id: Offline._novoId(),
    tabela: tabela,
    registro: registro,
    resumo: resumo || tabela,
    estado: 'pendente',
    erro: '',
    tentativas: 0,
    criadoEm: new Date().toISOString()
  };

  Offline._pendentes.push(item);
  Offline._gravarPendentes();
  Offline.atualizarBanner();

  /* Espelha o registro no DB local, para o usuário ver o lançamento
     na hora, mesmo sem ter ido ao servidor. */
  try { Offline._espelharNoDB(tabela, registro, item.id); } catch (e) {}

  if (typeof UI !== 'undefined' && UI.toast) {
    UI.toast(
      navigator.onLine
        ? 'Sem conexão com o servidor — guardado no aparelho'
        : 'Você está offline — guardado no aparelho',
      'ok'
    );
  }

  /* Mesma forma da resposta online */
  return {
    registro: registro,
    planoAtualizado: null,
    pendente: true,
    pendenteId: item.id
  };
};

/**
 * Acrescenta o lançamento à memória do app, marcado como pendente,
 * para aparecer nas listas antes de chegar ao servidor.
 */
Offline._espelharNoDB = function (tabela, registro, pendenteId) {
  var destino = {
    Abastecimentos: 'abastecimentos',
    Manutencoes: 'manutencoes',
    Despesas: 'despesas'
  }[tabela];

  if (!destino || !DB || !DB[destino]) return;

  var copia = {};
  for (var k in registro) copia[k] = registro[k];

  if (!copia.id) copia.id = 'LOCAL_' + pendenteId;
  copia._pendente = 1;

  DB[destino].push(copia);
};

/**
 * Envia os pendentes, um de cada vez, na ordem em que foram criados.
 *
 * Um de cada vez de propósito: o Apps Script trava a planilha
 * durante a escrita, e disparar tudo junto só gera erro de lock.
 */
Offline.sincronizarPendentes = function () {

  if (Offline._sincronizando) return Promise.resolve(false);
  if (!Offline._pendentes.length) return Promise.resolve(true);

  if (!navigator.onLine) {
    if (typeof UI !== 'undefined' && UI.toast) {
      UI.toast('Sem internet — vou tentar quando a conexão voltar', 'erro');
    }
    return Promise.resolve(false);
  }

  Offline._sincronizando = true;
  Offline._marcarBannerSincronizando();

  var fila = Offline._pendentes.filter(function (p) {
    return p.estado !== 'falha';
  });

  var enviados = 0;
  var falhas = 0;

  function proximo(indice) {

    if (indice >= fila.length) {
      Offline._sincronizando = false;
      Offline._gravarPendentes();
      Offline.atualizarBanner();
      Offline.renderSincronizador();

      if (enviados && typeof UI !== 'undefined' && UI.toast) {
        UI.toast(
          enviados + ' lançamento(s) enviado(s)' +
          (falhas ? ' · ' + falhas + ' com problema' : ''),
          falhas ? 'erro' : 'ok'
        );
      }

      /* Recarrega para trazer os dados já consolidados do servidor */
      if (enviados && typeof App !== 'undefined' && App.carregar) {
        App.carregar().catch(function () {});
      }

      return Promise.resolve(true);
    }

    var item = fila[indice];

    return api('salvar', item.tabela, item.registro)
      .then(function () {
        enviados++;
        Offline._pendentes = Offline._pendentes.filter(function (p) {
          return p.id !== item.id;
        });
        Offline._gravarPendentes();
        Offline._atualizarProgresso(enviados, fila.length);
        return proximo(indice + 1);
      })
      .catch(function (e) {

        /* Rede caiu de novo: para tudo e tenta mais tarde,
           mantendo o item como pendente (não como falha). */
        if (Offline._ehFalhaDeRede(e)) {
          Offline._sincronizando = false;
          Offline.atualizarBanner();
          return Promise.resolve(false);
        }

        /* Erro de regra: marca como falha para o usuário decidir */
        item.estado = 'falha';
        item.erro = (e && e.message) ? e.message : 'Erro ao enviar';
        item.tentativas = (item.tentativas || 0) + 1;
        falhas++;

        Offline._gravarPendentes();
        return proximo(indice + 1);
      });
  }

  return proximo(0);
};

Offline._sincronizando = false;

Offline._marcarBannerSincronizando = function () {
  var banner = $('bannerOffline');
  if (!banner) return;

  banner.classList.remove('oculto');
  banner.classList.add('visivel');
  document.body.classList.add('com-banner-offline');

  banner.classList.remove(
    'estado-offline', 'estado-pendente', 'estado-erro', 'estado-ok'
  );
  banner.classList.add('estado-sincronizando');

  setTexto('boIcone', 'cloud_sync');
  setTexto('boTitulo', 'Enviando…');
  setTexto('boSub', 'Sincronizando seus lançamentos');
};

Offline._atualizarProgresso = function (feitos, total) {
  setTexto('boSub', feitos + ' de ' + total + ' enviado(s)');
};

/**
 * Botão manual de sincronizar, dentro da tela de pendentes.
 */
Offline.sincronizarAgora = function () {
  Offline.sincronizarPendentes().then(function () {
    Offline.renderSincronizador();
  });
};


/**
 * Acrescenta o botão "Enviar agora" no topo da tela de pendentes.
 * (a versão original da tela não tinha como disparar manualmente)
 */
Offline._renderOriginal = Offline.renderSincronizador;

Offline.renderSincronizador = function () {
  Offline._renderOriginal();

  var lista = $('sincLista');
  if (!lista || !Offline._pendentes.length) return;
  if ($('btnSincronizarAgora')) return;

  var podeEnviar = navigator.onLine && !Offline._sincronizando;

  var botao =
    '<button id="btnSincronizarAgora" class="btn primario bloco-full" ' +
      'style="margin-bottom:14px"' + (podeEnviar ? '' : ' disabled') + ' ' +
      'onclick="Offline.sincronizarAgora()">' +
      '<span class="ms">cloud_upload</span> ' +
      (podeEnviar ? 'Enviar agora' : 'Sem conexão') +
    '</button>';

  lista.insertAdjacentHTML('beforebegin', botao);
};


/* =====================================================================
   3 — INSTALADOR
   ===================================================================== */

var Instalador = {

  _chaveEstado: 'carway_instalador_v1',
  _promptNativo: null,

  _lerEstado: function () {
    try {
      var txt = localStorage.getItem(Instalador._chaveEstado);
      if (!txt) return { visto: 0, adiadoAte: 0, instalado: 0 };
      var e = JSON.parse(txt);
      return {
        visto: Number(e.visto) || 0,
        adiadoAte: Number(e.adiadoAte) || 0,
        instalado: Number(e.instalado) || 0
      };
    } catch (e) {
      return { visto: 0, adiadoAte: 0, instalado: 0 };
    }
  },

  _gravarEstado: function (estado) {
    try {
      localStorage.setItem(Instalador._chaveEstado, JSON.stringify(estado));
    } catch (e) {}
  },

  detectar: function () {
    var ua = '';
    try { ua = (navigator.userAgent || '').toLowerCase(); } catch (e) {}

    var ehIOS = /iphone|ipad|ipod/.test(ua) ||
      (ua.indexOf('macintosh') > -1 && 'ontouchend' in document);

    var ehAndroid = ua.indexOf('android') > -1;

    var ehEmbutido =
      ua.indexOf('fban') > -1 || ua.indexOf('fbav') > -1 ||
      ua.indexOf('instagram') > -1 || ua.indexOf('line/') > -1 ||
      (ua.indexOf('wv)') > -1 && ehAndroid);

    var navegador = 'outro';
    if (ua.indexOf('edg') > -1) navegador = 'edge';
    else if (ua.indexOf('samsungbrowser') > -1) navegador = 'samsung';
    else if (ua.indexOf('firefox') > -1 || ua.indexOf('fxios') > -1) navegador = 'firefox';
    else if (ua.indexOf('chrome') > -1 || ua.indexOf('crios') > -1) navegador = 'chrome';
    else if (ua.indexOf('safari') > -1) navegador = 'safari';

    var jaInstalado = false;
    try {
      jaInstalado =
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true;
    } catch (e) {}

    return {
      ios: ehIOS, android: ehAndroid, desktop: !ehIOS && !ehAndroid,
      embutido: ehEmbutido, navegador: navegador, jaInstalado: jaInstalado
    };
  },

  iniciar: function () {
    var amb = Instalador.detectar();

    try {
      window.addEventListener('beforeinstallprompt', function (evento) {
        evento.preventDefault();
        Instalador._promptNativo = evento;
      });

      window.addEventListener('appinstalled', function () {
        var e = Instalador._lerEstado();
        e.instalado = 1;
        Instalador._gravarEstado(e);
        Instalador.fecharFaixa();
      });
    } catch (e) {}

    if (amb.jaInstalado) {
      var estado = Instalador._lerEstado();
      if (!estado.instalado) {
        estado.instalado = 1;
        Instalador._gravarEstado(estado);
      }
      return;
    }

    setTimeout(function () { Instalador.talvezConvidar(); }, 9000);
  },

  talvezConvidar: function () {
    if (typeof APP_PRONTO !== 'undefined' && !APP_PRONTO) return;

    var estado = Instalador._lerEstado();
    if (estado.instalado) return;

    if (estado.adiadoAte && new Date().getTime() < estado.adiadoAte) return;

    var amb = Instalador.detectar();
    if (amb.jaInstalado) return;
    if (amb.embutido && estado.visto >= 1) return;

    Instalador.mostrarFaixa();
  },

  mostrarFaixa: function () {
    if ($('faixaInstalar')) return;

    var html =
      '<div id="faixaInstalar" class="faixa-instalar">' +
        '<div class="fi-ico"><span class="ms">install_mobile</span></div>' +
        '<div class="fi-txt">' +
          '<b>Deixe o CarWay na tela inicial</b>' +
          '<small>Abre mais rápido, sem precisar procurar o link</small>' +
        '</div>' +
        '<div class="fi-acoes">' +
          '<button class="fi-btn" onclick="Instalador.abrirGuia()">Instalar</button>' +
          '<button class="fi-fechar" onclick="Instalador.adiar()" title="Agora não">' +
            '<span class="ms">close</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.insertAdjacentHTML('beforeend', html);

    setTimeout(function () {
      var f = $('faixaInstalar');
      if (f) f.classList.add('visivel');
    }, 40);

    var estado = Instalador._lerEstado();
    estado.visto = estado.visto + 1;
    Instalador._gravarEstado(estado);
  },

  fecharFaixa: function () {
    var f = $('faixaInstalar');
    if (!f) return;
    f.classList.remove('visivel');
    setTimeout(function () { if (f.parentNode) f.remove(); }, 300);
  },

  adiar: function () {
    var estado = Instalador._lerEstado();
    estado.adiadoAte = new Date().getTime() +
      ((estado.visto >= 3 ? 15 : 3) * 86400000);
    Instalador._gravarEstado(estado);
    Instalador.fecharFaixa();
  },

  abrirGuia: function () {
    Instalador.fecharFaixa();

    /* Fora do Apps Script o prompt nativo funciona de verdade */
    if (Instalador._promptNativo) {
      Instalador._promptNativo.prompt();
      Instalador._promptNativo.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') {
          var estado = Instalador._lerEstado();
          estado.instalado = 1;
          Instalador._gravarEstado(estado);
          UI.toast('CarWay instalado', 'ok');
        }
        Instalador._promptNativo = null;
      });
      return;
    }

    Instalador.renderGuia(Instalador.detectar());
  },

  renderGuia: function (amb) {
    var html = '';

    if (amb.jaInstalado) {
      UI.modal('Instalar o CarWay',
        '<div class="aviso verde"><span class="ms">check_circle</span><div>' +
        '<b>Já está instalado</b>' +
        'Você está usando o CarWay pelo atalho da tela inicial.</div></div>', null);
      return;
    }

    if (amb.embutido) {
      html =
        '<div class="aviso"><span class="ms">open_in_browser</span><div>' +
        '<b>Abra no navegador primeiro</b>' +
        'Você está dentro de outro aplicativo (WhatsApp, Instagram ou ' +
        'Facebook). Esses navegadores internos não criam atalhos.</div></div>' +
        '<div class="lista" style="margin-top:12px">' +
          Instalador._passo(1, 'more_vert', 'Toque nos três pontinhos no canto da tela') +
          Instalador._passo(2, 'open_in_browser', 'Escolha <b>Abrir no navegador</b>') +
          Instalador._passo(3, 'install_mobile', 'Já no navegador, volte aqui e toque em <b>Instalar</b>') +
        '</div>' + Instalador._blocoLink();

      UI.modal('Abra no navegador', html, null);
      return;
    }

    if (amb.ios) {
      html =
        '<div class="aviso info"><span class="ms">ios_share</span><div>' +
        '<b>iPhone e iPad</b>' +
        'O atalho precisa ser criado pelo <b>Safari</b>.</div></div>' +
        '<div class="lista" style="margin-top:12px">' +
          Instalador._passo(1, 'ios_share', 'Toque em <b>Compartilhar</b>, na barra de baixo') +
          Instalador._passo(2, 'add_box', 'Escolha <b>Adicionar à Tela de Início</b>') +
          Instalador._passo(3, 'check', 'Confirme o nome <b>CarWay</b> e toque em <b>Adicionar</b>') +
        '</div>';
    } else if (amb.android) {
      var caminho = (amb.navegador === 'samsung')
        ? 'Toque no menu e escolha <b>Adicionar página a</b> › <b>Tela inicial</b>'
        : 'Toque nos <b>três pontinhos</b> no canto superior direito';

      html =
        '<div class="aviso info"><span class="ms">android</span><div>' +
        '<b>Android</b>Em poucos toques o CarWay ganha ícone próprio.</div></div>' +
        '<div class="lista" style="margin-top:12px">' +
          Instalador._passo(1, 'more_vert', caminho) +
          Instalador._passo(2, 'add_to_home_screen', 'Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>') +
          Instalador._passo(3, 'check_circle', 'Confirme. O ícone aparece na tela inicial') +
        '</div>';
    } else {
      html =
        '<div class="aviso info"><span class="ms">computer</span><div>' +
        '<b>Computador</b>Deixe o CarWay como janela própria.</div></div>' +
        '<div class="lista" style="margin-top:12px">' +
          Instalador._passo(1, 'install_desktop', 'Procure o ícone de instalar na barra de endereços') +
          Instalador._passo(2, 'more_vert', 'Ou abra o menu › <b>Salvar e compartilhar</b>') +
          Instalador._passo(3, 'push_pin', 'Escolha <b>Instalar CarWay</b>') +
        '</div>';
    }

    html += Instalador._blocoLink() +
      '<div class="aviso verde" style="margin-top:12px">' +
      '<span class="ms">lock</span><div><b>Você continua conectado</b>' +
      'O atalho abre o CarWay já na sua conta.</div></div>';

    UI.modal('Instalar o CarWay', html, function () {
      var estado = Instalador._lerEstado();
      estado.instalado = 1;
      Instalador._gravarEstado(estado);
      UI.fecharModal();
      UI.toast('Pronto! Procure o ícone do CarWay', 'ok');
    }, 'Já adicionei');
  },

  _passo: function (numero, icone, texto) {
    return '<div class="item">' +
      '<div class="av azul"><b style="font-size:15px">' + numero + '</b></div>' +
      '<div class="txt" style="display:flex;align-items:center;gap:9px">' +
        '<span class="ms" style="font-size:20px;color:var(--txt2);flex:none">' +
        icone + '</span>' +
        '<small style="font-size:13px;line-height:1.5">' + texto + '</small>' +
      '</div></div>';
  },

  _blocoLink: function () {
    return '<div class="form" style="margin-top:14px">' +
      '<div><label>Endereço do CarWay</label>' +
      '<input id="urlInstalador" value="' + U.esc(location.origin + location.pathname) +
      '" readonly onclick="this.select()"></div>' +
      '<button type="button" class="btn ghost bloco-full" onclick="Instalador.copiarUrl()">' +
      '<span class="ms">content_copy</span> Copiar endereço</button></div>';
  },

  copiarUrl: function () {
    var campo = $('urlInstalador');
    if (!campo) return;
    campo.select();
    campo.setSelectionRange(0, 99999);
    try {
      document.execCommand('copy');
      UI.toast('Endereço copiado', 'ok');
    } catch (e) {
      UI.toast('Selecione e copie manualmente', 'erro');
    }
  }
};


/* =====================================================================
   4 — AJUSTES DE VERSÃO
   ===================================================================== */

/**
 * A checagem antiga falava em "4 arquivos" e "Index.html", que não
 * existem mais nesta arquitetura.
 */
App.checarVersao = function () {
  if (App._versaoBackend && App._versaoBackend !== VERSAO_FRONT) {
    if (window.console) {
      console.log('Backend v' + App._versaoBackend + ' × front v' + VERSAO_FRONT);
    }
  }

  var faltando = ['filtroPainel', 'hubs', 'barraVeiculos',
                  'btnCancelarLoad', 'mapaViagem', 'orcadoReal']
    .filter(function (id) { return !temEl(id); });

  if (faltando.length) {
    UI.modal('Arquivos desatualizados',
      '<div class="aviso"><span class="ms">warning</span><div>' +
      '<b>O index.html está defasado</b>' +
      'Não encontrei: <b>' + faltando.join(', ') + '</b>.</div></div>', null);
  }
};


/* =====================================================================
   BOOT
   ===================================================================== */

function bootApp() {

  Offline.iniciar();
  CarWaySW.registrar();
  Instalador.iniciar();

  var modal = $('modal');
  if (modal) {
    modal.addEventListener('click', function (ev) {
      if (ev.target.id === 'modal') UI.fecharModal();
    });
  }

  document.addEventListener('click', function (ev) {
    if (ev.target.closest && !ev.target.closest('.campo-geo')) {
      [].forEach.call(document.querySelectorAll('.sugestoes.aberto'), function (b) {
        b.classList.remove('aberto');
        b.innerHTML = '';
      });
    }
  });

  App.aplicarTemaSalvo();

  CARWAY_SESSAO.token = lerSessaoLocal();

  var sessaoUrl = lerParametroUrl('sessao');
  var conviteUrl = lerParametroUrl('convite');
  var atalho = lerParametroUrl('atalho');

  if (sessaoUrl) gravarSessaoLocal(sessaoUrl);
  limparUrlSensivel();

  if (conviteUrl) {
    App.processarConvite(conviteUrl);
    return;
  }

  App.iniciar().then(function (ok) {
    if (ok && atalho) {
      /* Atalhos do manifest: ?atalho=abastecimento, despesa, manutencao */
      setTimeout(function () {
        if (atalho === 'abastecimento') App.formAbastecimento();
        else if (atalho === 'despesa') App.formDespesa();
        else if (atalho === 'manutencao') App.formManutencao();
      }, 700);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
