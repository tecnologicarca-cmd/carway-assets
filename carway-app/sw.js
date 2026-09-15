/* =====================================================================
   CARWAY — SERVICE WORKER

   Estrategia:
     - Arquivos do app (shell): cache primeiro, atualiza em segundo plano.
       Abre instantaneo e funciona sem internet.
     - Chamadas a API: sempre rede. Nunca sao cacheadas, porque sao POST
       e porque dado de planilha precisa ser fresco.
     - Mapas e fontes externas: rede primeiro, cache como reserva.

   IMPORTANTE: ao alterar index.html, estilos.css ou script.js, suba o
   numero da VERSAO abaixo. Sem isso o navegador continua servindo o
   arquivo antigo do cache.
   ===================================================================== */

var VERSAO = 'carway-v11.0.0';

var CACHE_SHELL = VERSAO + '-shell';
var CACHE_EXTERNO = VERSAO + '-externo';

/* Arquivos que fazem o app abrir sozinho, sem internet */
var ARQUIVOS_SHELL = [
  './',
  './index.html',
  './estilos.css',
  './carway-config.js',
  './script.js',
  './manifest.json',
  './icones/carway-192.png',
  './icones/carway-512.png',
  './icones/carway-180.png'
];

/* Dominios que nao podem passar pelo cache em hipotese alguma */
function ehApi(url) {
  return url.indexOf('script.google.com') > -1 ||
         url.indexOf('script.googleusercontent.com') > -1;
}

/* Recursos externos que vale guardar como reserva */
function ehExternoCacheavel(url) {
  return url.indexOf('fonts.googleapis.com') > -1 ||
         url.indexOf('fonts.gstatic.com') > -1 ||
         url.indexOf('unpkg.com/leaflet') > -1;
}


/* ---------------------------------------------------------------------
   INSTALACAO
   --------------------------------------------------------------------- */

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE_SHELL)
      .then(function (cache) {
        /* addAll falha inteiro se um arquivo faltar.
           Guardamos um a um para ser tolerante. */
        return Promise.all(
          ARQUIVOS_SHELL.map(function (arquivo) {
            return cache.add(arquivo).catch(function () {
              /* arquivo ausente nao impede a instalacao */
            });
          })
        );
      })
      .then(function () { return self.skipWaiting(); })
  );
});


/* ---------------------------------------------------------------------
   ATIVACAO — remove caches de versoes anteriores
   --------------------------------------------------------------------- */

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys()
      .then(function (nomes) {
        return Promise.all(
          nomes.map(function (nome) {
            if (nome.indexOf(VERSAO) === 0) return null;
            return caches.delete(nome);
          })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});


/* ---------------------------------------------------------------------
   INTERCEPTACAO DAS REQUISICOES
   --------------------------------------------------------------------- */

self.addEventListener('fetch', function (evento) {
  var req = evento.request;
  var url = req.url;

  /* Só GET passa pelo cache */
  if (req.method !== 'GET') return;

  /* API: sempre rede, nunca cache */
  if (ehApi(url)) return;

  /* Externos: rede primeiro, cache como reserva */
  if (ehExternoCacheavel(url)) {
    evento.respondWith(
      fetch(req)
        .then(function (resposta) {
          if (resposta && (resposta.ok || resposta.type === 'opaque')) {
            var copia = resposta.clone();
            caches.open(CACHE_EXTERNO).then(function (c) {
              c.put(req, copia).catch(function () {});
            });
          }
          return resposta;
        })
        .catch(function () {
          return caches.match(req);
        })
    );
    return;
  }

  /* Só o que é do próprio domínio continua daqui */
  if (url.indexOf(self.location.origin) !== 0) return;

  /* Navegacao: tenta a rede, cai para o index em caso de falha.
     E o que faz o app abrir offline. */
  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req)
        .then(function (resposta) {
          var copia = resposta.clone();
          caches.open(CACHE_SHELL).then(function (c) {
            c.put('./index.html', copia).catch(function () {});
          });
          return resposta;
        })
        .catch(function () {
          return caches.match('./index.html')
            .then(function (r) { return r || caches.match('./'); });
        })
    );
    return;
  }

  /* Shell: cache primeiro, revalidando em segundo plano */
  evento.respondWith(
    caches.match(req).then(function (guardado) {

      var busca = fetch(req)
        .then(function (resposta) {
          if (resposta && resposta.ok) {
            var copia = resposta.clone();
            caches.open(CACHE_SHELL).then(function (c) {
              c.put(req, copia).catch(function () {});
            });
          }
          return resposta;
        })
        .catch(function () { return guardado; });

      return guardado || busca;
    })
  );
});


/* ---------------------------------------------------------------------
   MENSAGENS VINDAS DA PAGINA
   --------------------------------------------------------------------- */

self.addEventListener('message', function (evento) {
  var dados = evento.data || {};

  if (dados.acao === 'ATIVAR') {
    self.skipWaiting();
  }

  if (dados.acao === 'LIMPAR_CACHE') {
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) { return caches.delete(n); }));
    });
  }
});
