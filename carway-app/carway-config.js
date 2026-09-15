/* =====================================================================
   CARWAY — CAMADA DE INTEGRACAO (dominio proprio)

   Este arquivo substitui tudo o que dependia do Apps Script:
     - google.script.run   ->  fetch para a API
     - google.script.url   ->  URLSearchParams
     - CONVITE_TOKEN       ->  parametro da URL

   Carregue ANTES do script.js no index.html.
   ===================================================================== */

/* ---------------------------------------------------------------------
   CONFIGURACAO — o unico lugar que voce edita
   --------------------------------------------------------------------- */

var CARWAY_CONFIG = {

  /* URL /exec da implantacao de PRODUCAO do Apps Script.
     Se um dia voce republicar criando implantacao NOVA,
     troque aqui. */
  api: 'https://script.google.com/macros/s/AKfycbxVTdljXkDeXJIYlCSkr67NT1NlxO3jHItd5F00Dyw6wMy__7VfurXW4AqVTwP2P94H/exec',

  /* Versao dos arquivos estaticos. Ao mudar, o service worker
     descarta o cache antigo e busca tudo de novo. Suba este numero
     sempre que alterar index, estilos ou script. */
  versao: '11.0.0'
};


/* ---------------------------------------------------------------------
   SESSAO DO APARELHO
   --------------------------------------------------------------------- */

var CARWAY_SESSAO = { token: '' };
var CARWAY_CHAVE_SESSAO = 'carway_sessao_v1';

function lerSessaoLocal() {
  try { return localStorage.getItem(CARWAY_CHAVE_SESSAO) || ''; }
  catch (e) { return ''; }
}

function gravarSessaoLocal(token) {
  CARWAY_SESSAO.token = String(token || '');
  try {
    if (CARWAY_SESSAO.token) {
      localStorage.setItem(CARWAY_CHAVE_SESSAO, CARWAY_SESSAO.token);
    } else {
      localStorage.removeItem(CARWAY_CHAVE_SESSAO);
    }
  } catch (e) {}
}

function limparSessaoLocal() {
  gravarSessaoLocal('');
}


/* ---------------------------------------------------------------------
   PARAMETROS DA URL

   Fora do Apps Script nao existe google.script.url — a URL e direta.
   --------------------------------------------------------------------- */

function lerParametroUrl(nome) {
  try {
    var p = new URLSearchParams(window.location.search);
    return String(p.get(nome) || '').trim();
  } catch (e) {
    return '';
  }
}

/**
 * Tira os parametros sensiveis da barra de endereco depois de usados,
 * para o token nao ficar visivel nem ir parar no historico.
 */
function limparUrlSensivel() {
  try {
    if (!window.history || !window.history.replaceState) return;

    var p = new URLSearchParams(window.location.search);
    if (!p.has('sessao') && !p.has('convite')) return;

    p.delete('sessao');
    p.delete('convite');

    var q = p.toString();
    var nova = window.location.pathname + (q ? '?' + q : '');
    window.history.replaceState({}, document.title, nova);
  } catch (e) {}
}


/* ---------------------------------------------------------------------
   PONTE COM O SERVIDOR

   Mesma assinatura de sempre:
       api('carregarApp')
       api('salvar', 'Veiculos', registro)

   O Content-Type text/plain e proposital: evita o preflight OPTIONS,
   que o Apps Script nao responde.
   --------------------------------------------------------------------- */

function api(funcao) {
  var args = Array.prototype.slice.call(arguments, 1);

  return fetch(CARWAY_CONFIG.api, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      funcao: funcao,
      sessao: CARWAY_SESSAO.token || '',
      args: args,
      origem: location.origin
    }),
    redirect: 'follow'
  })
  .then(function (r) {
    return r.text().then(function (txt) {
      return { status: r.status, texto: txt };
    });
  })
  .then(function (r) {
    if (!r.texto) {
      throw new Error(
        'O servidor não respondeu. Tente novamente em alguns instantes.'
      );
    }

    var j;
    try {
      j = JSON.parse(r.texto);
    } catch (e) {
      /* Se voltou HTML, quase sempre e tela de login do Google:
         a implantacao nao esta como "Qualquer pessoa". */
      if (r.texto.indexOf('<') === 0) {
        throw new Error(
          'O servidor devolveu uma página em vez de dados. ' +
          'Verifique se a implantação está publicada para "Qualquer pessoa".'
        );
      }
      throw new Error('Resposta inválida do servidor.');
    }

    if (j && j.versao) App._versaoBackend = j.versao;

    if (j && j.ok === false) {
      throw new Error(j.erro || 'Erro no servidor');
    }

    return j && j.hasOwnProperty('dados') ? j.dados : j;
  })
  .catch(function (e) {
    /* Falha de rede vira mensagem util para o usuario */
    if (e && e.message === 'Failed to fetch') {
      if (!navigator.onLine) {
        throw new Error('Você está sem internet.');
      }
      throw new Error(
        'Não consegui falar com o servidor. Verifique sua conexão.'
      );
    }
    throw e;
  });
}


/* ---------------------------------------------------------------------
   SERVICE WORKER

   Aqui, sim, funciona de verdade — estamos fora do iframe.
   --------------------------------------------------------------------- */

var CarWaySW = {

  registro: null,

  registrar: function () {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js')
        .then(function (reg) {
          CarWaySW.registro = reg;

          /* Avisa quando houver versao nova esperando */
          reg.addEventListener('updatefound', function () {
            var novo = reg.installing;
            if (!novo) return;

            novo.addEventListener('statechange', function () {
              if (novo.state === 'installed' &&
                  navigator.serviceWorker.controller) {
                CarWaySW.avisarAtualizacao();
              }
            });
          });
        })
        .catch(function (e) {
          /* Sem service worker o app continua funcionando,
             so nao fica disponivel offline. */
          if (window.console) console.log('SW não registrou:', e.message);
        });
    });
  },

  avisarAtualizacao: function () {
    if (typeof UI === 'undefined' || !UI.modal) return;

    UI.modal('Nova versão disponível',
      '<div class="aviso info"><span class="ms">system_update</span><div>' +
      '<b>O CarWay foi atualizado</b>' +
      'Recarregue para usar a versão mais recente.</div></div>',
      function () { CarWaySW.aplicarAtualizacao(); },
      'Atualizar agora');
  },

  aplicarAtualizacao: function () {
    if (CarWaySW.registro && CarWaySW.registro.waiting) {
      CarWaySW.registro.waiting.postMessage({ acao: 'ATIVAR' });
    }
    setTimeout(function () { location.reload(); }, 300);
  },

  limparCache: function () {
    if (!('caches' in window)) return Promise.resolve();
    return caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) { return caches.delete(n); }));
    });
  }
};
