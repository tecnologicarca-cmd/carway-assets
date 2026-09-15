/* =====================================================================
   CARWAY — v9
   Google Maps Platform (Routes, Places, Geocoding)
   Pedagio automatico, paradas IDA/VOLTA com custo, paradas realizadas,
   FIPE, documentos com vencimento, alertas persistentes, depreciacao.
   ===================================================================== */

var VERSAO_FRONT = 9;

function dbVazio() {
  return { veiculos:[], viagens:[], despesas:[], abastecimentos:[], manutencoes:[], planos:[],
    alertas:[], categorias:['Combustível','Alimentação','Hospedagem','Pedágio','Estacionamento',
      'Lavagem','Manutenção','Multa','Outros'],
    coresCategoria:{}, tipos:[{id:'carro',nome:'Carro',icone:'directions_car',tanque:50}],
    cores:[{id:'azul',nome:'Azul',hex:'#3b82f6'}],
    lembretes:null, diasViagemAtiva:15, hoje:'', carimbo:0, resumo:{}, serie:[] };
}
var DB = dbVazio();
var VEICULO_SEL = 'todos';
var PAGINA = 'dashboard';
var VIAGEM_ABERTA = null;
var APP_PRONTO = false;
var FILTRO = { modo:'mes', ano:0, mes:0 };

function $(id) { return document.getElementById(id); }
function setHTML(id, html) { var e = $(id); if (e) { e.innerHTML = html; return true; } return false; }
function setTexto(id, txt) { var e = $(id); if (e) { e.textContent = txt; return true; } return false; }
function temEl(id) { return !!$(id); }


function comPrazo(promessa, ms, msgErro) {
  return new Promise(function (resolve, reject) {
    var fim = false;
    var t = setTimeout(function () {
      if (fim) return; fim = true;
      reject(new Error(msgErro || 'A consulta demorou demais.'));
    }, ms || 45000);
    promessa.then(function (r) { if (fim) return; fim = true; clearTimeout(t); resolve(r); })
            .catch(function (e) { if (fim) return; fim = true; clearTimeout(t); reject(e); });
  });
}

var U = {
  moeda: function (n) { return 'R$ ' + (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); },
  moedaCurta: function (n) {
    n = Number(n)||0;
    if (n >= 1000) return 'R$ ' + (n/1000).toFixed(1).replace('.',',') + 'k';
    return 'R$ ' + n.toFixed(0);
  },
  num: function (n,d) { return (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); },
  data: function (s) { if(!s) return '—'; var p=String(s).substring(0,10).split('-'); return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(s); },
  hoje: function () { if (DB.hoje) return DB.hoje; var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); },
  MESES: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
  MESES3: ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],
  DIAS: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],
  mesNome: function (ym) { var p=String(ym).split('-'); return (U.MESES3[parseInt(p[1],10)-1]||'')+'/'+String(p[0]).substring(2); },
  mesLongo: function (ym) { var p=String(ym).split('-'); return (U.MESES[parseInt(p[1],10)-1]||'')+' de '+p[0]; },
  hm: function (min) { min=Number(min)||0; var h=Math.floor(min/60), m=min%60; return h ? h+'h'+(m<10?'0':'')+m : m+' min'; },
  esc: function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[c];
    });
  },
  veic: function (id) { var l=DB.veiculos||[]; for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i]; return null; },
  veicAtual: function () { return U.veic(VEICULO_SEL) || (DB.veiculos && DB.veiculos[0]) || null; },
  nomeVeic: function (id) { var v=U.veic(id); return v ? v.nome+' • '+v.placa : 'Veículo removido'; },
  viagem: function (id) { var l=DB.viagens||[]; for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i]; return null; },
  plano: function (id) { var l=DB.planos||[]; for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i]; return null; },
  multi: function () { return (DB.veiculos||[]).length > 1; },
  ico: function (tipo) { var t=(DB.tipos||[]).filter(function(x){return x.id===tipo;})[0]; return t?t.icone:'directions_car'; },
  nomeTipo: function (tipo) { var t=(DB.tipos||[]).filter(function(x){return x.id===tipo;})[0]; return t?t.nome:'Veículo'; },
  hex: function (cor) { var c=(DB.cores||[]).filter(function(x){return x.id===cor;})[0]; return c?c.hex:'#3b82f6'; },
  hexVeic: function (id) { var v=U.veic(id); return v?U.hex(v.cor):'#3b82f6'; },
  corCat: function (c) { return (DB.coresCategoria||{})[c] || '#94a3b8'; },
  selo: function (id) {
    var v = U.veic(id);
    if (!v) return '<span class="selo-veic"><span class="ms">help</span>Removido</span>';
    return '<span class="selo-veic" style="--c:'+U.hex(v.cor)+'"><span class="ms">'+U.ico(v.tipo)+'</span>'+U.esc(v.nome)+'</span>';
  },
  temVeiculo: function () {
    if (!APP_PRONTO) { UI.toast('Aguarde o app carregar…','erro'); return false; }
    if (!DB.veiculos || !DB.veiculos.length) {
      UI.toast('Cadastre seu veículo primeiro','erro');
      setTimeout(function(){ App.formVeiculo(true); }, 400);
      return false;
    }
    return true;
  },
  filtraVeic: function (arr) { arr=arr||[]; return VEICULO_SEL==='todos' ? arr : arr.filter(function(x){ return x.veiculoId===VEICULO_SEL; }); },
  ordData: function (arr) { return (arr||[]).slice().sort(function(a,b){ return String(b.data).localeCompare(String(a.data)); }); },
  icoCat: function (c) {
    return ({ 'Combustível':'local_gas_station','Alimentação':'restaurant','Hospedagem':'hotel','Pedágio':'toll',
      'Estacionamento':'local_parking','Lavagem':'local_car_wash','Manutenção':'build','Multa':'gavel','Outros':'receipt_long'
    })[c] || 'receipt_long';
  },
  noPeriodo: function (dataStr) {
    if (FILTRO.modo === 'tudo') return true;
    if (!dataStr) return false;
    var s = String(dataStr);
    if (FILTRO.modo === 'ano') return s.substring(0,4) === String(FILTRO.ano);
    return s.substring(0,7) === (FILTRO.ano + '-' + ('0'+FILTRO.mes).slice(-2));
  },
  filtra: function (arr) { return U.filtraVeic(arr).filter(function (x) { return U.noPeriodo(x.data); }); },
  rotuloPeriodo: function () {
    if (FILTRO.modo === 'tudo') return 'Desde o início';
    if (FILTRO.modo === 'ano') return 'Ano de ' + FILTRO.ano;
    return U.MESES[FILTRO.mes-1] + ' de ' + FILTRO.ano;
  },
  anosDisponiveis: function () {
    var set = {};
    ['abastecimentos','manutencoes','despesas'].forEach(function (k) {
      (DB[k]||[]).forEach(function (x) { if (x.data) set[String(x.data).substring(0,4)] = 1; });
    });
    (DB.viagens||[]).forEach(function (v) { if (v.dataInicio) set[String(v.dataInicio).substring(0,4)] = 1; });
    set[String(new Date().getFullYear())] = 1;
    return Object.keys(set).sort().reverse();
  }
};

var UI = {
  toast: function (msg, tipo) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.className = 'on ' + (tipo||'');
    clearTimeout(UI._tt); UI._tt = setTimeout(function(){ t.className=''; }, 4000);
  },
  load: function (on, txt, aoCancelar) {
    var el = $('carregando');
    if (el) el.classList.toggle('oculto', !on);
    if (txt) setTexto('loadTexto', txt);
    var b = $('btnCancelarLoad');
    if (b) {
      if (on && aoCancelar) { b.classList.remove('oculto'); b.onclick = function () { UI.load(false); aoCancelar(); }; }
      else b.classList.add('oculto');
    }
    if (!on) UI.progresso('');
  },
  progresso: function (txt) { setTexto('loadProgresso', txt || ''); },
  modal: function (titulo, html, onSalvar, textoBtn) {
    if (!temEl('modal')) { alert(titulo); return; }
    if (typeof App !== 'undefined' && App._mostrarTabbarSeNecessario) {
      App._mostrarTabbarSeNecessario();
    }

    setTexto('modalTitulo', titulo);
    setHTML('modalCorpo', html);
    var rod = $('modalRodape');
    if (rod) rod.style.display = onSalvar ? 'flex' : 'none';
    if (onSalvar) {
      var b = $('btnSalvarModal');
      if (b) { b.textContent = textoBtn || 'Salvar'; b.onclick = onSalvar; }
    }
    $('modal').classList.add('aberto');
    var mb = document.querySelector('.modal-body'); if (mb) mb.scrollTop = 0;
  },

  fecharModal: function () {
    var m = $('modal');
    if (m) m.classList.remove('aberto');

    if (typeof PAGINA !== 'undefined' && PAGINA === 'menu') {
      var tab = $('tabbar');
      if (tab) tab.classList.add('oculto');
    }
  },
  v: function (id) { var e=$(id); return e ? String(e.value).trim() : ''; },
  n: function (id) { var s=UI.v(id).replace(',','.'); var n=parseFloat(s); return isNaN(n)?0:n; },
  chk: function (id) { var e=$(id); return e ? !!e.checked : false; },
  vazio: function (ico, txt) { return '<div class="vazio"><span class="ms">'+ico+'</span>'+txt+'</div>'; },

  seletorVeiculo: function (idCampo, sel, titulo) {
    var lista = DB.veiculos || [];
    if (!lista.length) return '';
    sel = sel || (lista[0] && lista[0].id);
    if (lista.length === 1) {
      var v = lista[0];
      return '<input type="hidden" id="'+idCampo+'" value="'+v.id+'">' +
        '<div class="veic-unico" style="--c:'+U.hex(v.cor)+'">' +
        '<span class="ms">'+U.ico(v.tipo)+'</span>' +
        '<div><b>'+U.esc(v.nome)+'</b><small>'+U.esc(v.placa)+' · '+U.num(v.kmAtual)+' km</small></div></div>';
    }
    return '<div class="grupo-veic"><label>'+(titulo || 'Qual veículo?')+'</label>' +
      '<input type="hidden" id="'+idCampo+'" value="'+sel+'">' +
      '<div class="veic-cards" id="cards'+idCampo+'">' +
      lista.map(function (v) {
        return '<div class="veic-card'+(v.id===sel?' sel':'')+'" style="--c:'+U.hex(v.cor)+'" ' +
          'data-id="'+v.id+'" onclick="UI.escolherVeic(\''+idCampo+'\',this)">' +
          '<span class="ms">'+U.ico(v.tipo)+'</span><b>'+U.esc(v.nome)+'</b>' +
          '<small>'+U.esc(v.placa||U.nomeTipo(v.tipo))+'</small>' +
          '<i class="check ms">check_circle</i></div>';
      }).join('') + '</div></div>';
  },
  escolherVeic: function (idCampo, el) {
    var cont = $('cards'+idCampo);
    if (cont) [].forEach.call(cont.querySelectorAll('.veic-card'), function(c){ c.classList.remove('sel'); });
    el.classList.add('sel');
    var id = el.getAttribute('data-id');
    var campo = $(idCampo); if (campo) campo.value = id;
    if (typeof UI._aoTrocarVeic === 'function') UI._aoTrocarVeic(id);
  },
  _aoTrocarVeic: null,

  optViagens: function (sel, veiculoId) {
    var todas = DB.viagens || [];
    var lista = todas.filter(function (v) {
      if (veiculoId && v.veiculoId !== veiculoId) return false;
      return v.ativa === 1 || v.id === sel;
    });
    var ocultas = todas.filter(function (v) {
      return (!veiculoId || v.veiculoId === veiculoId) && v.ativa !== 1 && v.id !== sel;
    }).length;
    var html = '<option value="">Nenhuma (gasto do dia a dia)</option>' + lista.map(function (v) {
      var antiga = v.ativa !== 1 ? ' (concluída)' : '';
      return '<option value="'+v.id+'"'+(v.id===sel?' selected':'')+'>' +
        U.esc(v.titulo||(v.origem+' → '+v.destino)) + antiga + '</option>';
    }).join('');
    if (ocultas) html += '<option value="" disabled>— ' + ocultas + ' antiga(s) oculta(s) —</option>';
    return html;
  },

  optPlanos: function (veiculoId, sel) {
    var lista = (DB.planos||[]).filter(function (p) { return p.veiculoId === veiculoId; })
      .sort(function (a,b) { return String(a.item).localeCompare(String(b.item)); });
    var html = '<option value="">— Serviço avulso (não zera revisão) —</option>';
    html += lista.map(function (p) {
      return '<option value="'+p.id+'"'+(p.id===sel?' selected':'')+'>'+U.esc(p.item)+'</option>';
    }).join('');
    return html;
  },

  confirmar: function (opcoes) {
    opcoes = opcoes || {};
    var titulo = opcoes.titulo || 'Confirmar';
    var mensagem = opcoes.mensagem || 'Tem certeza que deseja continuar?';
    var textoBotao = opcoes.textoBotao || 'Confirmar';
    var icone = opcoes.icone || 'warning';
    var aoConfirmar = opcoes.aoConfirmar;

    var html =
      '<div class="aviso">' +
        '<span class="ms">' + icone + '</span>' +
        '<div>' + mensagem + '</div>' +
      '</div>';

    UI.modal(titulo, html, function () {
      UI.fecharModal();
      if (typeof aoConfirmar === 'function') aoConfirmar();
    }, textoBotao);
  }
};

function campo(label, input) { return '<div><label>'+label+'</label>'+input+'</div>'; }

var App = {
  _versaoBackend: 0,

iniciar: function () {
      var d = new Date();
      FILTRO.ano = d.getFullYear();
      FILTRO.mes = d.getMonth() + 1;
      App.carregar(true).then(function () {
        App.irParaMenu();
      }).catch(function () {});
    },

  carregar: function (primeira) {
    if (!primeira) UI.load(true, 'Atualizando…');
    return api('carregarApp').then(function (d) {
      if (!d || typeof d !== 'object') throw new Error('O servidor devolveu dados vazios.');
      var base = dbVazio();
      for (var k in base) if (d[k] === undefined || d[k] === null) d[k] = base[k];
      DB = d; APP_PRONTO = true;
      if (primeira && DB.hoje) {
        var p = DB.hoje.split('-');
        if (p.length === 3) { FILTRO.ano = parseInt(p[0],10); FILTRO.mes = parseInt(p[1],10); }
      }
      App.montarSeletor(); App.render();
      UI.load(false); App.fecharSplash(); App.checarVersao();
      App.atualizarSininho();
      if (primeira && !DB.veiculos.length) setTimeout(function(){ App.formVeiculo(true); }, 600);
      return d;
    }).catch(function (e) {
      UI.load(false); App.fecharSplash();

      var msg = e.message || '';

if (msg.indexOf('SEM_CONTA:') === 0) {
  App.telaSemAcesso('SEM_CONTA', msg.substring(10));
} else if (msg.indexOf('SEM_ORGANIZACAO:') === 0) {
  App.telaSemAcesso('SEM_ORGANIZACAO', msg.substring(16));
} else if (msg.indexOf('ORGANIZACAO_INATIVA:') === 0) {
  App.telaSemAcesso('ORGANIZACAO_INATIVA', msg.substring(20));
} else {
        App.erroFatal(msg || 'Falha ao carregar os dados');
      }

      throw e;
    });
  },

aposSalvar: function (msg, extra) {
  if (!navigator.onLine) {
    UI.load(false);

    if (msg) {
      UI.toast(msg, 'ok');
    }

    App.render();

    if (typeof extra === 'function') {
      extra();
    }

    return Promise.resolve(true);
  }

  return App.carregar().then(function () {
    if (
      VIAGEM_ABERTA &&
      U.viagem(VIAGEM_ABERTA)
    ) {
      App.abrirViagem(
        VIAGEM_ABERTA,
        true
      );
    }

    if (msg) {
      UI.toast(
        msg,
        'ok'
      );
    }

    if (
      typeof extra === 'function'
    ) {
      extra();
    }

    return true;
  }).catch(function (e) {
    UI.load(false);

    UI.toast(
      'Salvou, mas falhou ao atualizar: ' +
        e.message,
      'erro'
    );

    throw e;
  });
},

  checarVersao: function () {
    if (App._versaoBackend && App._versaoBackend !== VERSAO_FRONT) {
      UI.toast('Codigo.gs v'+App._versaoBackend+' × app v'+VERSAO_FRONT+'. Atualize os 4 arquivos.','erro');
      return;
    }
    var faltando = ['filtroPainel','hubs','barraVeiculos','btnCancelarLoad','mapaViagem','orcadoReal']
      .filter(function (id) { return !temEl(id); });
    if (faltando.length) {
      UI.modal('Arquivos desatualizados',
        '<div class="aviso"><span class="ms">warning</span><div><b>O Index.html está defasado</b>' +
        'Não encontrei: <b>'+faltando.join(', ')+'</b>.</div></div>' +
        '<div class="aviso info"><span class="ms">checklist</span><div><b>Como resolver</b>' +
        'Substitua os <b>quatro</b> arquivos pela versão '+VERSAO_FRONT+'.</div></div>', null);
    }
  },

  fecharSplash: function () {
    var s = $('splash');
    if (s && s.style.display !== 'none') { s.style.opacity = 0; setTimeout(function(){ s.style.display='none'; }, 400); }
  },

  erroFatal: function (msg) {
    UI.modal('Não foi possível carregar',
      '<div class="aviso"><span class="ms">error</span><div><b>Erro</b>'+U.esc(msg)+'</div></div>' +
      '<div class="aviso info"><span class="ms">build_circle</span><div><b>Como resolver</b>' +
      '1. Confira se os 4 arquivos são da mesma versão<br>' +
      '2. Apps Script → rode <b>instalar</b><br>3. Autorize<br>4. Recarregue</div></div>' +
      '<div class="acao-topo" style="margin:14px 0 0">' +
      '<button class="btn primario bloco-full" onclick="UI.fecharModal();App.carregar()">' +
      '<span class="ms">refresh</span> Tentar novamente</button></div>', null);
  },

  recarregar: function () { App.carregar().then(function(){ if (APP_PRONTO) UI.toast('Dados atualizados','ok'); }); },

  montarSeletor: function () {
    var barra = $('barraVeiculos');
    if (!barra) return;
    if (!U.multi()) { barra.classList.add('oculto'); barra.innerHTML=''; VEICULO_SEL='todos'; return; }
    barra.classList.remove('oculto');
    barra.innerHTML =
      '<button class="pill'+(VEICULO_SEL==='todos'?' sel':'')+'" onclick="App.trocarVeiculo(\'todos\')">' +
      '<span class="ms">apps</span>Todos</button>' +
      DB.veiculos.map(function (v) {
        return '<button class="pill'+(VEICULO_SEL===v.id?' sel':'')+'" style="--c:'+U.hex(v.cor)+'" ' +
          'onclick="App.trocarVeiculo(\''+v.id+'\')"><span class="ms">'+U.ico(v.tipo)+'</span>'+U.esc(v.nome) +
          (v.alertas ? '<i class="badge'+(v.vencidos?' urg':'')+'">'+v.alertas+'</i>' : '') + '</button>';
      }).join('');
  },

  trocarVeiculo: function (id) { VEICULO_SEL = id; App.montarSeletor(); App.render(); App.carregarResumoDocs(true); },

irPara: function (pg) {
  UI.fecharModal();

  PAGINA = pg;

  App.atualizarBotaoVoltar();

  [].forEach.call(
    document.querySelectorAll('.pagina'),
    function (pagina) {
      pagina.classList.toggle(
        'ativa',
        pagina.id === 'pg-' + pg
      );
    }
  );

  [].forEach.call(
    document.querySelectorAll('.tab'),
    function (tab) {
      tab.classList.remove('oculto');

      tab.classList.toggle(
        'ativa',
        tab.dataset.pg === pg
      );
    }
  );

  App._mostrarTabbarSeNecessario();

  var titulos = {
    dashboard: [
      'Painel',
      'Resumo dos gastos'
    ],
    veiculos: [
      'Meus veículos',
      'Cadastro e comparativo'
    ],
    viagens: [
      'Viagens',
      'Planejamento e gastos'
    ],
    viagem: [
      'Viagem',
      'Detalhes e lançamentos'
    ],
    abastecimentos: [
      'Abastecimento',
      'Consumo e custos'
    ],
    manutencao: [
      'Manutenção',
      'Revisões por km e tempo'
    ],
    mapa: [
      'Mapa',
      'Rota, postos e pedágios'
    ]
  };

  var titulo = titulos[pg] || [
    'CarWay',
    ''
  ];

  var veiculo = U.veic(VEICULO_SEL);

  setTexto(
    'tituloPagina',
    titulo[0]
  );

  setTexto(
    'subPagina',
    veiculo && pg !== 'veiculos'
      ? veiculo.nome + ' • ' + veiculo.placa
      : titulo[1]
  );

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

  if (pg === 'mapa') {
    setTimeout(
      Viagem.ajustarMapa,
      200
    );
  }

  if (pg === 'viagem') {
    setTimeout(function () {
      Viagem.ajustarMapaViagem();
    }, 250);
  }
},

  trocarAba: function (a) {
    [].forEach.call(document.querySelectorAll('.aba'), function(e){ e.classList.toggle('ativa', e.dataset.aba===a); });
    [].forEach.call(document.querySelectorAll('.aba-conteudo'), function(e){ e.classList.toggle('ativa', e.id==='ab-'+a); });
  },

render: function () {
      try { App.renderFiltro(); } catch (e) {}
      try { App.renderHubs(); } catch (e) {}
      try { App.renderVeiculos(); } catch (e) {}
      try { App.renderViagens(); } catch (e) {}
      try { App.renderAbastecimentos(); } catch (e) {}
      try { App.renderMonitor(); } catch (e) {}
      try { App.renderManutencoes(); } catch (e) {}
      try { App.renderPlanos(); } catch (e) {}
      try { App.renderMenu(); } catch (e) {}
    }
};

/* ===================== PAINEL ===================== */

App.renderFiltro = function () {
  if (!temEl('filtroPainel')) return;
  var anos = U.anosDisponiveis();
  var htmlMes = U.MESES.map(function (m,i) {
    return '<option value="'+(i+1)+'"'+((i+1)===FILTRO.mes?' selected':'')+'>'+m+'</option>';
  }).join('');
  var htmlAno = anos.map(function (a) {
    return '<option value="'+a+'"'+(String(a)===String(FILTRO.ano)?' selected':'')+'>'+a+'</option>';
  }).join('');
  setHTML('filtroPainel',
    '<div class="fp-modos">' +
      '<button class="fp-modo'+(FILTRO.modo==='mes'?' sel':'')+'" onclick="App.setModo(\'mes\')">Mês</button>' +
      '<button class="fp-modo'+(FILTRO.modo==='ano'?' sel':'')+'" onclick="App.setModo(\'ano\')">Ano</button>' +
      '<button class="fp-modo'+(FILTRO.modo==='tudo'?' sel':'')+'" onclick="App.setModo(\'tudo\')">Tudo</button>' +
    '</div><div class="fp-campos">' +
      (FILTRO.modo==='mes'
        ? '<button class="fp-nav" onclick="App.navMes(-1)"><span class="ms">chevron_left</span></button>' +
          '<select class="fp-sel" onchange="App.setMes(this.value)">'+htmlMes+'</select>' +
          '<select class="fp-sel curto" onchange="App.setAno(this.value)">'+htmlAno+'</select>' +
          '<button class="fp-nav" onclick="App.navMes(1)"><span class="ms">chevron_right</span></button>'
        : (FILTRO.modo==='ano'
          ? '<button class="fp-nav" onclick="App.navAno(-1)"><span class="ms">chevron_left</span></button>' +
            '<select class="fp-sel" onchange="App.setAno(this.value)">'+htmlAno+'</select>' +
            '<button class="fp-nav" onclick="App.navAno(1)"><span class="ms">chevron_right</span></button>'
          : '<div class="fp-tudo"><span class="ms">all_inclusive</span>Todos os lançamentos</div>')) +
    '</div>');
};

App.setModo = function (m) { FILTRO.modo = m; App.renderFiltro(); App.renderHubs(); };
App.setMes = function (v) { FILTRO.mes = parseInt(v,10); App.renderFiltro(); App.renderHubs(); };
App.setAno = function (v) { FILTRO.ano = parseInt(v,10); App.renderFiltro(); App.renderHubs(); };
App.navMes = function (d) {
  FILTRO.mes += d;
  if (FILTRO.mes > 12) { FILTRO.mes = 1; FILTRO.ano++; }
  if (FILTRO.mes < 1) { FILTRO.mes = 12; FILTRO.ano--; }
  App.renderFiltro(); App.renderHubs();
};
App.navAno = function (d) { FILTRO.ano += d; App.renderFiltro(); App.renderHubs(); };

App.calcPeriodo = function (veiculoId) {
  var vid = veiculoId || VEICULO_SEL;
  function pertence(x) {
    if (vid !== 'todos' && x.veiculoId !== vid) return false;
    return U.noPeriodo(x.data);
  }
  var comb = 0, litros = 0, nAb = 0;
  (DB.abastecimentos||[]).forEach(function (a) {
    if (!pertence(a)) return;
    var val = Number(a.valorTotal)||0;
    if (val <= 0) val = (Number(a.litros)||0)*(Number(a.precoLitro)||0);
    comb += val; litros += Number(a.litros)||0; nAb++;
  });
  var manut = 0, nMan = 0;
  (DB.manutencoes||[]).forEach(function (m) { if (pertence(m)) { manut += Number(m.custo)||0; nMan++; } });
  var despV = 0, despR = 0, porCat = {};
  (DB.despesas||[]).forEach(function (d) {
    if (!pertence(d)) return;
    var val = Number(d.valor)||0;
    if (d.viagemId) despV += val; else despR += val;
    var k = d.categoria || 'Outros';
    porCat[k] = (porCat[k]||0) + val;
  });
  var nVia = 0;
  (DB.viagens||[]).forEach(function (v) {
    if (vid !== 'todos' && v.veiculoId !== vid) return;
    if (U.noPeriodo(v.dataInicio)) nVia++;
  });
  return { combustivel:comb, litros:litros, manutencao:manut, despesaViagem:despV, despesaRotina:despR,
           total: comb+manut+despV+despR, qtdAbast:nAb, qtdManut:nMan, qtdViagens:nVia, porCategoria:porCat };
};

App.renderHubs = function () {
  if (!temEl('hubs')) return;
  var p = App.calcPeriodo();
  var alertas = VEICULO_SEL==='todos' ? (DB.alertas||[]) : (DB.alertas||[]).filter(function(a){return a.veiculoId===VEICULO_SEL;});
  var pend = alertas.filter(function(a){return a.status!=='ok';}).length;
  var venc = alertas.filter(function(a){return a.status==='vencido';}).length;
  var med = 0, n = 0;
  (VEICULO_SEL==='todos'?DB.veiculos:DB.veiculos.filter(function(v){return v.id===VEICULO_SEL;}))
    .forEach(function (v) { if (v.consumo && v.consumo.mediaKmL>0) { med += v.consumo.mediaKmL; n++; } });

  setHTML('resumoPeriodo',
    '<div class="rp-cab"><span class="ms">event</span>'+U.rotuloPeriodo() +
    (VEICULO_SEL!=='todos' ? ' · ' + U.esc((U.veic(VEICULO_SEL)||{}).nome) : (U.multi()?' · todos os veículos':'')) + '</div>' +
    '<div class="rp-valor">'+U.moeda(p.total)+'</div>' +
    '<div class="rp-det">'+p.qtdAbast+' abastecimento(s) · '+p.qtdManut+' manutenção(ões) · '+p.qtdViagens+' viagem(ns)</div>');

  var lem = DB.lembretes || {};
  var lemSub = lem.ativo
    ? (lem.frequencia === 'diario' ? 'Todo dia às ' + lem.hora + 'h' : 'Toda ' + U.DIAS[lem.diaSemana||2].toLowerCase() + ' às ' + lem.hora + 'h')
    : 'Desativado — toque para configurar';

  setHTML('hubs',
    App.hub('revisao', pend ? (venc?'error':'schedule') : 'verified', 'Alertas de revisão',
      pend ? pend + (pend===1?' item pendente':' itens pendentes') : 'Tudo em dia',
      pend ? (venc?'urgente':'atencao') : 'ok', pend > 0) +
    App.hub('documentos', 'folder_shared', 'Documentos',
      '<span id="hubDocSub">carregando…</span>', 'ciano', false) +
    App.hub('equipe', 'groups', 'Equipe',
      'Convide quem também usa este veículo', 'roxo', false) +
    App.hub('dinheiro', 'savings', 'Onde vai meu dinheiro', U.moeda(p.total) + ' no período', 'roxo', false) +
    App.hub('meses', 'bar_chart', 'Gastos por mês', (DB.serie||[]).length + ' mês(es) com lançamento', 'azul', false) +
    App.hub('consumo', 'speed', 'Consumo dos veículos',
      n ? (med/n).toFixed(2) + ' km/L de média' : 'Sem dados ainda', 'verde', false) +
    App.hub('lembretes', lem.ativo ? 'mark_email_read' : 'mail', 'Lembretes por e-mail', lemSub,
      lem.ativo ? 'ok' : 'cinza', false));

  App.carregarResumoDocs();
};

App.hub = function (id, ico, titulo, sub, cor, pulsa) {
  return '<button class="hub '+cor+(pulsa?' pulsa':'')+'" onclick="App.abrirHub(\''+id+'\')">' +
    '<span class="hub-ico"><span class="ms">'+ico+'</span></span>' +
    '<div class="hub-txt"><b>'+titulo+'</b><small>'+sub+'</small></div>' +
    '<span class="ms hub-seta">chevron_right</span></button>';
};

App.abrirHub = function (id) {
  if (id === 'revisao') return App.hubRevisao();
  if (id === 'documentos') return App.hubDocumentos();
  if (id === 'equipe') return App.hubEquipe();
  if (id === 'dinheiro') return App.hubDinheiro();
  if (id === 'meses') return App.hubMeses();
  if (id === 'consumo') return App.hubConsumo();
  if (id === 'lembretes') return App.hubLembretes();
};

App.hubLembretes = function () {
  var c = DB.lembretes || {};
  var email = c.email || c.emailPadrao || '';
  var freq = c.frequencia || 'semanal';
  var hora = c.hora === undefined ? 8 : c.hora;
  var dia = c.diaSemana === undefined ? 2 : c.diaSemana;
  var horas = '';
  for (var h = 5; h <= 22; h++) horas += '<option value="'+h+'"'+(h===hora?' selected':'')+'>'+h+':00</option>';
  var dias = U.DIAS.map(function (d,i) {
    return '<option value="'+i+'"'+(i===dia?' selected':'')+'>'+d+'</option>';
  }).join('');
  var estado = c.ativo
    ? '<div class="aviso verde"><span class="ms">mark_email_read</span><div><b>Lembretes ativos</b>' +
      (freq === 'diario' ? 'Todo dia' : 'Toda ' + U.DIAS[dia].toLowerCase()) + ' às ' + hora + 'h para <b>' + U.esc(email) + '</b>' +
      (c.ultimoEnvio ? '<br>Último envio: ' + U.esc(c.ultimoEnvio) : '') + '</div></div>'
    : '<div class="aviso info"><span class="ms">mail</span><div><b>Como funciona</b>' +
      'O app confere as revisões e manda um resumo por e-mail. Tudo automático.</div></div>';
  var html = estado + '<div class="form">' +
    '<div class="switch"><span>Enviar lembretes automaticamente</span>' +
    '<input type="checkbox" id="lemAtivo"'+(c.ativo?' checked':'')+' onchange="App.togglLembrete()"></div>' +
    '<div id="lemCampos" class="'+(c.ativo?'':'esmaecido')+'">' +
      campo('E-mail que vai receber','<input id="lemEmail" type="email" value="'+U.esc(email)+'" placeholder="voce@gmail.com">') +
      campo('Com que frequência','<select id="lemFreq" onchange="App.togglFreq()">' +
        '<option value="semanal"'+(freq==='semanal'?' selected':'')+'>Uma vez por semana</option>' +
        '<option value="diario"'+(freq==='diario'?' selected':'')+'>Todo dia</option></select>') +
      '<div class="linha2">' +
        '<div id="boxDiaSemana"'+(freq==='diario'?' class="oculto"':'')+'>' +
          campo('Dia da semana','<select id="lemDia">'+dias+'</select>') + '</div>' +
        campo('Horário','<select id="lemHora">'+horas+'</select>') + '</div>' +
      campo('Antecedência do aviso','<select id="lemDias">' +
        [7,15,30,45,60].map(function (d) {
          return '<option value="'+d+'"'+((c.diasAntes||30)===d?' selected':'')+'>'+d+' dias antes</option>';
        }).join('') + '</select>') +
    '</div></div>' +
    '<div class="acao-topo" style="margin-top:14px">' +
    '<button class="btn ghost bloco-full" onclick="App.testarLembrete()">' +
    '<span class="ms">send</span> Enviar um teste agora</button></div>';
  if (c.cotaRestante >= 0) html += '<p class="dica">Restam ' + c.cotaRestante + ' e-mail(s) hoje.</p>';
  UI.modal('Lembretes por e-mail', html, function () { App.salvarLembretes(); }, 'Salvar');
};

App.togglLembrete = function () {
  var box = $('lemCampos');
  if (box) box.className = UI.chk('lemAtivo') ? '' : 'esmaecido';
};
App.togglFreq = function () {
  var box = $('boxDiaSemana');
  if (box) box.classList.toggle('oculto', UI.v('lemFreq') === 'diario');
};
App.salvarLembretes = function () {
  var ativo = UI.chk('lemAtivo');
  var email = UI.v('lemEmail');
  if (ativo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return UI.toast('Informe um e-mail válido','erro');
  var op = { ativo:ativo, email:email, frequencia:UI.v('lemFreq'),
             hora:UI.n('lemHora'), diaSemana:UI.n('lemDia'), diasAntes:UI.n('lemDias') };
  UI.fecharModal(); UI.load(true,'Configurando…');
  api('configurarLembretes', op)
    .then(function (r) { return App.aposSalvar(r.resumo); })
    .catch(function (e) { UI.load(false); UI.toast(e.message,'erro'); });
};
App.testarLembrete = function () {
  var email = UI.v('lemEmail');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return UI.toast('Informe um e-mail válido','erro');
  UI.load(true,'Enviando o teste…');
  api('enviarLembreteTeste', email).then(function (r) {
    UI.load(false);
    UI.toast('Enviado para ' + r.email, 'ok');
  }).catch(function (e) { UI.load(false); UI.toast(e.message,'erro'); });
};

App.hubRevisao = function () {
  var todos = VEICULO_SEL==='todos' ? (DB.alertas||[]) : (DB.alertas||[]).filter(function(a){return a.veiculoId===VEICULO_SEL;});
  if (!todos.length) {
    return UI.modal('Alertas de revisão',
      UI.vazio('event_repeat','Nenhum plano de revisão.<br>Crie em <b>Manutenção → Planos</b>.') +
      '<div class="acao-topo" style="margin-top:14px">' +
      '<button class="btn primario bloco-full" onclick="UI.fecharModal();App.irPara(\'manutencao\');App.trocarAba(\'planos\')">' +
      '<span class="ms">event_repeat</span> Ir para Planos</button></div>', null);
  }
  var venc = todos.filter(function(a){return a.status==='vencido';});
  var aten = todos.filter(function(a){return a.status==='atencao';});
  var ok   = todos.filter(function(a){return a.status==='ok';});
  var html = '<div class="hub-resumo">' +
    '<div class="hr-item r"><b>'+venc.length+'</b><small>vencidos</small></div>' +
    '<div class="hr-item a"><b>'+aten.length+'</b><small>atenção</small></div>' +
    '<div class="hr-item v"><b>'+ok.length+'</b><small>em dia</small></div></div>';
  function bloco(titulo, lista, cls) {
    if (!lista.length) return '';
    return '<h4 class="hub-sec '+cls+'">'+titulo+' ('+lista.length+')</h4><div class="lista">' +
      lista.map(App.cardAlerta).join('') + '</div>';
  }
  html += bloco('Vencidos', venc, 'r') + bloco('Atenção', aten, 'a');
  if (ok.length) {
    html += '<h4 class="hub-sec v">Em dia ('+ok.length+')</h4><div class="lista-min">' +
      ok.map(function (a) {
        return '<div class="min-item" style="--c:'+U.hex(a.veiculoCor)+'"><span class="ms">check_circle</span>' +
          '<div><b>'+U.esc(a.item)+'</b>' + (U.multi()?'<small>'+U.esc(a.veiculoNome)+'</small>':'') + '</div>' +
          '<small>'+(a.proximoKm?U.num(a.proximoKm)+' km':U.data(a.proximaData))+'</small></div>';
      }).join('') + '</div>';
  }
  UI.modal('Alertas de revisão', html, null);
};

App.cardAlerta = function (a) {
  var cor = a.status==='vencido'?'vermelho':(a.status==='atencao'?'amarelo':'verde');
  var ico = a.status==='vencido'?'error':(a.status==='atencao'?'schedule':'check_circle');
  var det = [];
  if (a.proximoKm) det.push('Próx.: '+U.num(a.proximoKm)+' km (atual '+U.num(a.kmAtual)+')');
  if (a.proximaData) det.push('Prazo: '+U.data(a.proximaData));
  return '<div class="item" style="--c:'+U.hex(a.veiculoCor)+'">' +
    '<div class="av '+cor+'"><span class="ms">'+ico+'</span></div>' +
    '<div class="txt"><b>'+U.esc(a.item)+'</b>' + (U.multi() ? U.selo(a.veiculoId) : '') +
    '<small>'+(det.length?U.esc(det.join(' · ')):'')+'</small>' +
    '<span class="tag '+a.status+'">'+U.esc(a.motivo)+'</span>' +
    (a.qtdRegistros ? '<span class="tag">'+a.qtdRegistros+' registro(s)</span>' : '') +
    '<div class="barra"><i class="'+(a.status!=='ok'?a.status:'')+'" style="width:'+Math.min(100,a.progresso)+'%"></i></div>' +
    '<div class="acoes-item">' +
    '<button onclick="UI.fecharModal();App.concluirRevisao(\''+a.planoId+'\')"><span class="ms">task_alt</span> Lançar serviço</button>' +
    (a.status!=='ok' ? '<button onclick="App.marcarFeita(\''+a.planoId+'\')"><span class="ms">done_all</span> Já fiz (sem custo)</button>' : '') +
    '</div></div></div>';
};

App.marcarFeita = function (planoId) {
  var a = (DB.alertas||[]).filter(function (x) { return x.planoId === planoId; })[0];
  if (!a) return;

  UI.confirmar({
    titulo: 'Marcar como feita',
    mensagem: 'A revisão "' + U.esc(a.item) + '" será marcada como feita agora, sem registrar custo. ' +
      'Use esta opção apenas quando não houve gasto (por exemplo, uma checagem simples).',
    textoBotao: 'Marcar como feita',
    icone: 'done_all',
    aoConfirmar: function () {
      UI.load(true,'Atualizando…');
      api('marcarRevisaoFeita', planoId, a.kmAtual, U.hoje())
        .then(function (r) { return App.aposSalvar(r.item + ' marcada como feita'); })
        .catch(function (e) { UI.load(false); UI.toast(e.message,'erro'); });
    }
  });
};

App.hubDinheiro = function () {
  var p = App.calcPeriodo();
  if (p.total <= 0) {
    return UI.modal('Onde vai meu dinheiro',
      '<div class="hub-periodo"><span class="ms">event</span>'+U.rotuloPeriodo()+'</div>' +
      UI.vazio('savings','Nenhum gasto neste período.'), null);
  }
  var itens = [
    ['Combustível', p.combustivel, '#3b82f6', 'local_gas_station'],
    ['Manutenção', p.manutencao, '#a78bfa', 'build'],
    ['Despesas de viagem', p.despesaViagem, '#22c55e', 'luggage'],
    ['Outras despesas', p.despesaRotina, '#f59e0b', 'receipt_long']
  ].filter(function (x) { return x[1] > 0; });
  var html = '<div class="hub-periodo"><span class="ms">event</span>'+U.rotuloPeriodo()+'</div>' +
    '<div class="rosca">' + App.rosca(itens, p.total) + '</div>' +
    '<div class="divisao">' + itens.map(function (x) {
      return '<div class="div-lin"><span><i class="dot" style="background:'+x[2]+'"></i>' +
        '<span class="ms" style="font-size:15px">'+x[3]+'</span>'+x[0]+'</span>' +
        '<b>'+U.moeda(x[1])+' <small style="color:var(--txt2);font-weight:400">'+(x[1]/p.total*100).toFixed(0)+'%</small></b></div>';
    }).join('') +
    '<div class="div-lin" style="border-top:2px solid var(--linha);margin-top:4px">' +
    '<span style="color:var(--txt)">Total</span><b style="font-size:15px">'+U.moeda(p.total)+'</b></div></div>';
  if (U.multi() && VEICULO_SEL === 'todos') {
    var linhas = DB.veiculos.map(function (v) { return { v:v, p:App.calcPeriodo(v.id) }; })
      .filter(function (x) { return x.p.total > 0; })
      .sort(function (a,b) { return b.p.total - a.p.total; });
    if (linhas.length) {
      var maxV = linhas[0].p.total;
      html += '<h4 class="hub-sec">Gasto por veículo</h4><div class="por-veic">' +
        linhas.map(function (x) {
          return '<div class="pv-lin" style="--c:'+U.hex(x.v.cor)+'">' +
            '<div class="pv-cab"><span class="ms">'+U.ico(x.v.tipo)+'</span>' +
            '<b>'+U.esc(x.v.nome)+'</b><span class="pv-val">'+U.moeda(x.p.total)+'</span></div>' +
            '<div class="pv-bar"><i style="width:'+(x.p.total/maxV*100)+'%"></i></div>' +
            '<div class="pv-det">Comb. '+U.moedaCurta(x.p.combustivel)+' · Manut. '+U.moedaCurta(x.p.manutencao) +
            ' · Desp. '+U.moedaCurta(x.p.despesaViagem + x.p.despesaRotina)+'</div></div>';
        }).join('') + '</div>';
    }
  }
  var cats = Object.keys(p.porCategoria||{}).sort(function (a,b) { return p.porCategoria[b]-p.porCategoria[a]; });
  if (cats.length) {
    html += '<h4 class="hub-sec">Detalhe das despesas</h4><div class="divisao">' +
      cats.map(function (k) {
        return '<div class="div-lin"><span><i class="dot" style="background:'+U.corCat(k)+'"></i>' +
          '<span class="ms" style="font-size:16px">'+U.icoCat(k)+'</span>'+k+'</span>' +
          '<b>'+U.moeda(p.porCategoria[k])+'</b></div>';
      }).join('') + '</div>';
  }
  UI.modal('Onde vai meu dinheiro', html, null);
};

App.rosca = function (itens, total) {
  var r = 54, cx = 70, cy = 70, circ = 2*Math.PI*r, acum = 0;

  var claro = document.body.classList.contains('tema-claro');
  var corTrilha = claro ? '#e2e8f0' : '#1c2946';
  var corTexto  = claro ? '#111827' : '#e8eefc';
  var corSub    = claro ? '#5b6577' : '#93a4c8';

  var arcos = itens.map(function (x) {
    var frac = x[1]/total;
    var dash = (frac*circ) + ' ' + circ;
    var off = -acum*circ;
    acum += frac;
    return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+x[2]+'" stroke-width="20" ' +
      'stroke-dasharray="'+dash+'" stroke-dashoffset="'+off+'" transform="rotate(-90 '+cx+' '+cy+')"></circle>';
  }).join('');

  return '<svg viewBox="0 0 140 140" width="150" height="150">' +
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+corTrilha+'" stroke-width="20"></circle>' + arcos +
    '<text x="70" y="66" text-anchor="middle" fill="'+corTexto+'" font-size="15" font-weight="700">' +
    U.moedaCurta(total) + '</text>' +
    '<text x="70" y="82" text-anchor="middle" fill="'+corSub+'" font-size="9">total</text></svg>';
};

App.hubMeses = function () {
  var serie = (DB.serie||[]).slice();
  if (VEICULO_SEL !== 'todos') serie = App.serieDoVeiculo(VEICULO_SEL);
  if (!serie.length) return UI.modal('Gastos por mês', UI.vazio('bar_chart','Nenhum lançamento ainda.'), null);
  var max = 1;
  serie.forEach(function (x) { max = Math.max(max, x.combustivel + x.manutencao + x.despesas); });
  var barras = serie.map(function (x) {
    var tot = x.combustivel + x.manutencao + x.despesas;
    var h = Math.max(4, (tot/max)*100);
    var atual = (FILTRO.modo==='mes' && x.ym === (FILTRO.ano+'-'+('0'+FILTRO.mes).slice(-2)));
    return '<div class="mb-col'+(atual?' atual':'')+'" onclick="App.detalheMes(\''+x.ym+'\')">' +
      '<div class="mb-val">'+U.moedaCurta(tot)+'</div>' +
      '<div class="mb-pil" style="height:'+h+'%">' +
        '<i style="height:'+(tot?x.combustivel/tot*100:0)+'%;background:#3b82f6"></i>' +
        '<i style="height:'+(tot?x.manutencao/tot*100:0)+'%;background:#a78bfa"></i>' +
        '<i style="height:'+(tot?x.despesas/tot*100:0)+'%;background:#22c55e"></i>' +
      '</div><small>'+U.mesNome(x.ym)+'</small></div>';
  }).join('');
  var soma = { c:0, m:0, d:0 };
  serie.forEach(function (x) { soma.c += x.combustivel; soma.m += x.manutencao; soma.d += x.despesas; });
  var totGeral = soma.c + soma.m + soma.d;
  var html = '<div class="hub-periodo"><span class="ms">insights</span>Últimos '+serie.length+' mês(es)</div>' +
    '<div class="mb-grafico">'+barras+'</div>' +
    '<div class="legenda"><span><i class="dot azul"></i>Combustível</span>' +
    '<span><i class="dot roxo"></i>Manutenção</span><span><i class="dot verde"></i>Despesas</span></div>' +
    '<p class="dica" style="text-align:center;margin-top:8px">Toque numa barra para ver o mês</p>' +
    '<div class="hub-resumo" style="margin-top:14px">' +
    '<div class="hr-item"><b>'+U.moedaCurta(totGeral)+'</b><small>total no período</small></div>' +
    '<div class="hr-item"><b>'+U.moedaCurta(totGeral/serie.length)+'</b><small>média por mês</small></div></div>' +
    '<h4 class="hub-sec">Mês a mês</h4><div class="lista-min">' +
    serie.slice().reverse().map(function (x) {
      var tot = x.combustivel + x.manutencao + x.despesas;
      return '<div class="min-item clicavel" onclick="App.detalheMes(\''+x.ym+'\')">' +
        '<span class="ms">calendar_month</span>' +
        '<div><b>'+U.mesLongo(x.ym)+'</b><small>'+U.num(x.litros,1)+' L abastecidos</small></div>' +
        '<small style="font-weight:700;color:var(--txt)">'+U.moeda(tot)+'</small></div>';
    }).join('') + '</div>';
  UI.modal('Gastos por mês', html, null);
};

App.serieDoVeiculo = function (vid) {
  var mapa = {}, chaves = [];
  function bk(ym) {
    if (!mapa[ym]) { mapa[ym] = { ym:ym, combustivel:0, manutencao:0, despesas:0, litros:0 }; chaves.push(ym); }
    return mapa[ym];
  }
  (DB.abastecimentos||[]).forEach(function (a) {
    if (a.veiculoId !== vid || !a.data) return;
    var b = bk(String(a.data).substring(0,7));
    var val = Number(a.valorTotal)||0;
    if (val <= 0) val = (Number(a.litros)||0)*(Number(a.precoLitro)||0);
    b.combustivel += val; b.litros += Number(a.litros)||0;
  });
  (DB.manutencoes||[]).forEach(function (m) {
    if (m.veiculoId !== vid || !m.data) return;
    bk(String(m.data).substring(0,7)).manutencao += Number(m.custo)||0;
  });
  (DB.despesas||[]).forEach(function (d) {
    if (d.veiculoId !== vid || !d.data) return;
    bk(String(d.data).substring(0,7)).despesas += Number(d.valor)||0;
  });
  chaves.sort();
  return chaves.slice(-12).map(function (k) { return mapa[k]; });
};

App.detalheMes = function (ym) {
  var p = ym.split('-');
  var ano = parseInt(p[0],10), mes = parseInt(p[1],10);
  var guarda = { modo:FILTRO.modo, ano:FILTRO.ano, mes:FILTRO.mes };
  FILTRO.modo = 'mes'; FILTRO.ano = ano; FILTRO.mes = mes;
  var d = App.calcPeriodo();
  var lancs = [];
  U.filtra(DB.abastecimentos).forEach(function (a) {
    var val = Number(a.valorTotal)||0;
    if (val <= 0) val = (Number(a.litros)||0)*(Number(a.precoLitro)||0);
    lancs.push({ data:a.data, ico:'local_gas_station', cor:'', titulo:U.num(a.litros,2)+' L',
      sub:(a.posto||'Posto')+' · '+U.num(a.km)+' km', valor:val, vid:a.veiculoId });
  });
  U.filtra(DB.manutencoes).forEach(function (m) {
    lancs.push({ data:m.data, ico:'build', cor:'amarelo', titulo:m.item,
      sub:(m.oficina||m.tipo||'')+' · '+U.num(m.km)+' km', valor:Number(m.custo)||0, vid:m.veiculoId });
  });
  U.filtra(DB.despesas).forEach(function (x) {
    lancs.push({ data:x.data, ico:U.icoCat(x.categoria), cor:'verde', titulo:x.descricao||x.categoria,
      sub:x.categoria+(x.local?' · '+x.local:''), valor:Number(x.valor)||0, vid:x.veiculoId });
  });
  lancs.sort(function (a,b) { return String(b.data).localeCompare(String(a.data)); });
  var html = '<div class="hub-periodo"><span class="ms">calendar_month</span>'+U.mesLongo(ym)+'</div>' +
    '<div class="hub-resumo">' +
    '<div class="hr-item"><b>'+U.moedaCurta(d.combustivel)+'</b><small>combustível</small></div>' +
    '<div class="hr-item"><b>'+U.moedaCurta(d.manutencao)+'</b><small>manutenção</small></div>' +
    '<div class="hr-item"><b>'+U.moedaCurta(d.despesaViagem+d.despesaRotina)+'</b><small>despesas</small></div></div>' +
    '<div class="total-mes"><span>Total do mês</span><b>'+U.moeda(d.total)+'</b></div>';
  html += lancs.length
    ? '<h4 class="hub-sec">'+lancs.length+' lançamento(s)</h4><div class="lista">' +
      lancs.map(function (x) {
        return '<div class="item"><div class="av '+x.cor+'"><span class="ms">'+x.ico+'</span></div>' +
          '<div class="txt"><b>'+U.esc(x.titulo)+'</b>' +
          (U.multi() && VEICULO_SEL==='todos' ? U.selo(x.vid) : '') +
          '<small>'+U.data(x.data)+' · '+U.esc(x.sub)+'</small></div>' +
          '<div class="val"><b>'+U.moeda(x.valor)+'</b></div></div>';
      }).join('') + '</div>'
    : UI.vazio('receipt_long','Nenhum lançamento neste mês');
  html += '<div class="acao-topo" style="margin-top:14px">' +
    '<button class="btn primario bloco-full" onclick="App.irParaMes('+ano+','+mes+')">' +
    '<span class="ms">filter_alt</span> Filtrar o painel por este mês</button></div>';
  FILTRO.modo = guarda.modo; FILTRO.ano = guarda.ano; FILTRO.mes = guarda.mes;
  UI.modal('Detalhe do mês', html, null);
};

App.irParaMes = function (ano, mes) {
  FILTRO.modo = 'mes'; FILTRO.ano = ano; FILTRO.mes = mes;
  UI.fecharModal(); App.renderFiltro(); App.renderHubs();
  UI.toast('Painel filtrado por ' + U.MESES[mes-1] + '/' + ano, 'ok');
};

App.hubConsumo = function () {
  var lista = VEICULO_SEL==='todos' ? (DB.veiculos||[]) : (DB.veiculos||[]).filter(function(v){return v.id===VEICULO_SEL;});
  if (!lista.length) return UI.modal('Consumo dos veículos', UI.vazio('directions_car','Cadastre um veículo.'), null);
  var html = '<div class="hub-periodo"><span class="ms">speed</span>Resumo · '+U.rotuloPeriodo()+'</div>';
  html += lista.map(function (v) {
    var c = v.consumo || {};
    var p = App.calcPeriodo(v.id);
    var alertasV = (DB.alertas||[]).filter(function (a) { return a.veiculoId === v.id && a.status !== 'ok'; });
    var semDados = (c.metodo === 'sem-dados' || c.metodo === 'aguardando');
    return '<div class="card-consumo" style="--c:'+U.hex(v.cor)+'">' +
      '<div class="cc-topo"><div class="cc-ico"><span class="ms">'+U.ico(v.tipo)+'</span></div>' +
      '<div class="cc-id"><b>'+U.esc(v.nome)+'</b><small>'+U.esc(v.placa)+' · '+U.num(v.kmAtual)+' km</small></div>' +
      '<div class="cc-kml"><b>'+(semDados?'—':c.mediaKmL)+'</b><small>km/L</small></div></div>' +
      (semDados
        ? '<div class="cc-aguarda"><span class="ms">info</span>' +
          (c.abastecimentos ? 'Registre o 2º abastecimento para calcular' : 'Nenhum abastecimento') + '</div>'
        : '<div class="cc-linha"><span>Melhor / pior</span><b>'+c.melhorKmL+' / '+c.piorKmL+' km/L</b></div>' +
          '<div class="cc-linha"><span>Custo por km</span><b>'+U.moeda(c.custoPorKm)+'</b></div>' +
          '<div class="cc-linha"><span>Autonomia</span><b>'+U.num(v.autonomia)+' km</b></div>') +
      (c.trechosDescartados ?
        '<div class="cc-aguarda" style="margin-top:9px"><span class="ms">rule</span>' +
        c.trechosDescartados+' trecho(s) ignorado(s) por consumo fora do normal ('+
        c.limiteMin+'–'+c.limiteMax+' km/L).</div>' : '') +
      '<div class="cc-gastos"><h5>Gastos · '+U.rotuloPeriodo()+'</h5><div class="cc-grid">' +
        '<div><span class="ms">local_gas_station</span><b>'+U.moedaCurta(p.combustivel)+'</b><small>combustível</small></div>' +
        '<div><span class="ms">build</span><b>'+U.moedaCurta(p.manutencao)+'</b><small>manutenção</small></div>' +
        '<div><span class="ms">luggage</span><b>'+U.moedaCurta(p.despesaViagem)+'</b><small>viagens</small></div>' +
        '<div><span class="ms">payments</span><b>'+U.moedaCurta(p.total)+'</b><small>total</small></div></div></div>' +
      '<div class="cc-hist"><span>'+v.qtdAbastecimentos+' abastec.</span>' +
      '<span>'+v.qtdManutencoes+' manut.</span><span>'+v.qtdViagens+' viagens</span></div>' +
      (alertasV.length
        ? '<div class="cc-alertas"><h5><span class="ms">warning</span>Manutenções próximas</h5>' +
          alertasV.slice(0,3).map(function (a) {
            return '<div class="cc-al '+a.status+'"><span class="ms">'+(a.status==='vencido'?'error':'schedule')+'</span>' +
              '<div><b>'+U.esc(a.item)+'</b><small>'+U.esc(a.motivo)+'</small></div></div>';
          }).join('') + '</div>'
        : '<div class="cc-alertas ok"><span class="ms">verified</span>Revisões em dia</div>') +
      '<div class="cc-acoes">' +
      '<button onclick="UI.fecharModal();App.formAbastecimento(\''+v.id+'\')"><span class="ms">local_gas_station</span>Abastecer</button>' +
      '<button onclick="UI.fecharModal();App.verManutencaoVeiculo(\''+v.id+'\')"><span class="ms">build</span>Revisões</button>' +
      '<button onclick="UI.fecharModal();App.pdfManutencao(\''+v.id+'\')"><span class="ms">picture_as_pdf</span>PDF</button>' +
      '</div></div>';
  }).join('');
  UI.modal('Consumo dos veículos', html, null);
};

/* ==================== ALERTAS PERSISTENTES ==================== */

App._alertas = [];
App._alertasResumo = null;

App.atualizarSininho = function () {
  /* Usa o resumo que ja veio junto com carregarApp(), sem chamada extra */
  if (DB.resumoAlertas) {
    App._pintarSininho(DB.resumoAlertas.total, DB.resumoAlertas.vencidos);
    return;
  }

  /* Fallback: se por algum motivo o campo nao vier, busca separado */
  api('contarAlertasNaoLidos').then(function (d) {
    App._pintarSininho(d.total, d.vencidos);
  }).catch(function () {});
};

App._pintarSininho = function (total, vencidos) {
  var badge = $('sininhoBadge');
  if (!badge) return;

  if (!total) {
    badge.classList.add('oculto');
    badge.textContent = '';
    return;
  }

  badge.classList.remove('oculto');
  badge.textContent = total > 99 ? '99+' : total;
  badge.classList.toggle('urg', vencidos > 0);
};

App.abrirAlertas = function () {
  UI.load(true, 'Carregando alertas…');

  api('listarAlertas', VEICULO_SEL).then(function (d) {
    UI.load(false);

    App._alertas = d.alertas || [];
    App._alertasResumo = d.resumo;

    if (!App._alertas.length) {
      return UI.modal('Alertas',
        UI.vazio('notifications_off','Nenhum alerta pendente no momento.<br>' +
          'Tudo em dia com manutenções e documentos.'), null);
    }

    var r = d.resumo;

    var html = '<div class="hub-periodo"><span class="ms">notifications</span>' +
      r.total + ' alerta(s)' +
      (r.naoLidos ? ' · ' + r.naoLidos + ' não lido(s)' : '') + '</div>';

    if (r.naoLidos > 0) {
      html += '<div class="acao-topo" style="margin-bottom:14px">' +
        '<button class="btn ghost bloco-full" onclick="App.lerTodosAlertas()">' +
        '<span class="ms">done_all</span> Marcar todos como lidos</button></div>';
    }

    html += '<div class="lista">' + App._alertas.map(App.cardAlertaPersistente).join('') + '</div>';

    UI.modal('Alertas', html, null);

  }).catch(function (e) {
    UI.load(false);
    UI.toast(e.message || 'Falha ao carregar alertas','erro');
  });
};

App.cardAlertaPersistente = function (a) {
  var cor = a.prioridade === 'vencido' ? 'vermelho' : 'amarelo';
  var ico = a.tipo === 'DOCUMENTO' ? 'folder_shared' : 'build';
  var lido = a.status === 'LIDO';

  var origem = a.veiculoNome
    ? '<span class="selo-veic" style="--c:'+U.hex(a.veiculoCor)+'">' +
      '<span class="ms">'+U.ico(a.veiculoTipo)+'</span>'+U.esc(a.veiculoNome)+'</span>'
    : (a.tipo === 'DOCUMENTO'
      ? '<span class="tag azul"><span class="ms" style="font-size:13px">person</span>motorista</span>'
      : '');

  return '<div class="item'+(lido?' antiga':'')+'" style="--c:'+(a.veiculoCor?U.hex(a.veiculoCor):'#3b82f6')+'">' +
    '<div class="av '+cor+'"><span class="ms">'+ico+'</span></div>' +
    '<div class="txt"><b>'+U.esc(a.titulo)+'</b>' + origem +
    '<small>'+U.esc(a.descricao)+'</small>' +
    '<span class="tag '+(a.prioridade==='vencido'?'vencido':'atencao')+'">' +
      (a.prioridade === 'vencido' ? 'Vencido' : 'Atenção') + '</span>' +
    (lido ? '<span class="tag">lido</span>' : '') +
    '<div class="acoes-item">' +
      (a.tipo === 'DOCUMENTO'
        ? '<button onclick="UI.fecharModal();App.hubDocumentos()"><span class="ms">folder_shared</span> Ver documento</button>'
        : '<button onclick="UI.fecharModal();App.concluirRevisao(\''+a.referenciaId+'\')"><span class="ms">task_alt</span> Lançar serviço</button>') +
      (!lido ? '<button onclick="App.lerAlerta(\''+a.id+'\')"><span class="ms">done</span> Marcar como lido</button>' : '') +
      '<button onclick="App.descartarAlertaUI(\''+a.id+'\')"><span class="ms">close</span> Descartar</button>' +
    '</div></div></div>';
};

App.lerAlerta = function (id) {
  api('marcarAlertaLido', id).then(function () {
    App.abrirAlertas();
    App.atualizarSininho();
  }).catch(function (e) { UI.toast(e.message,'erro'); });
};

App.lerTodosAlertas = function () {
  UI.load(true,'Atualizando…');

  api('marcarTodosAlertasLidos', VEICULO_SEL).then(function () {
    UI.load(false);
    App.abrirAlertas();
    App.atualizarSininho();
  }).catch(function (e) {
    UI.load(false); UI.toast(e.message,'erro');
  });
};

App.descartarAlertaUI = function (id) {
  if (!confirm('Descartar este alerta? Ele não aparecerá mais.')) return;

  api('descartarAlerta', id).then(function () {
    App.abrirAlertas();
    App.atualizarSininho();
  }).catch(function (e) { UI.toast(e.message,'erro'); });
};

/* ==================== DOCUMENTOS COM VENCIMENTO ==================== */

App._documentos = [];
App._tiposDoc = [];
App._resumoDocs = null;

App.carregarResumoDocs = function (forcarServidor) {
  /* No carregamento normal, usa o resumo que ja veio em carregarApp().
     So faz uma chamada nova ao servidor quando for pedido
     explicitamente (por exemplo, ao trocar de veiculo, onde o
     resumo pode mudar por causa do filtro). */
  if (!forcarServidor && DB.resumoDocumentos && VEICULO_SEL === 'todos') {
    App._resumoDocs = DB.resumoDocumentos;
    App.atualizarHubDocs();
    return Promise.resolve(DB.resumoDocumentos);
  }

  return api('listarDocumentos', VEICULO_SEL).then(function (d) {
    App._resumoDocs = d.resumo;
    App._documentos = d.documentos || [];
    App.atualizarHubDocs();
    return d;
  }).catch(function () {
    App._resumoDocs = null;
  });
};


App.atualizarHubDocs = function () {
  var el = $('hubDocSub');
  if (!el || !App._resumoDocs) return;

  var r = App._resumoDocs;

  if (r.total === 0) {
    el.textContent = 'Nenhum documento cadastrado';
    return;
  }

  if (r.vencidos > 0) {
    el.textContent = r.vencidos + (r.vencidos === 1 ? ' vencido' : ' vencidos') +
      (r.atencao ? ' e ' + r.atencao + ' a vencer' : '');
    return;
  }

  if (r.atencao > 0) {
    el.textContent = r.atencao + (r.atencao === 1 ? ' vence em breve' : ' vencem em breve');
    return;
  }

  el.textContent = r.total + ' documento(s) em dia';
};

App.hubDocumentos = function () {
  UI.load(true, 'Carregando documentos…');

  api('listarDocumentos', VEICULO_SEL).then(function (d) {
    UI.load(false);

    App._documentos = d.documentos || [];
    App._resumoDocs = d.resumo;
    var r = d.resumo;

    if (!App._documentos.length) {
      return UI.modal('Documentos',
        '<div class="aviso info"><span class="ms">folder</span><div>' +
        '<b>Nenhum documento cadastrado</b>' +
        'Controle IPVA, licenciamento, seguro e a validade da CNH ' +
        'com aviso antes do vencimento.</div></div>' +
        '<div class="acao-topo" style="margin-top:14px">' +
        '<button class="btn primario bloco-full" onclick="UI.fecharModal();App.formDocumento()">' +
        '<span class="ms">add</span> Cadastrar documento</button></div>' +
        '<div class="acao-topo" style="margin:0">' +
        '<button class="btn ghost bloco-full" onclick="UI.fecharModal();App.docsPadrao()">' +
        '<span class="ms">auto_awesome</span> Sugerir automaticamente</button></div>', null);
    }

    var html = '<div class="hub-resumo">' +
      '<div class="hr-item r"><b>'+r.vencidos+'</b><small>vencidos</small></div>' +
      '<div class="hr-item a"><b>'+r.atencao+'</b><small>a vencer</small></div>' +
      '<div class="hr-item v"><b>'+r.emDia+'</b><small>em dia</small></div></div>';

    if (r.valorPendente > 0) {
      html += '<div class="aviso"><span class="ms">payments</span><div>' +
        '<b>'+U.moeda(r.valorPendente)+' pendentes</b>' +
        'Somando os documentos vencidos e a vencer.</div></div>';
    }

    function grupo(titulo, lista, cls) {
      if (!lista.length) return '';
      return '<h4 class="hub-sec '+cls+'">'+titulo+' ('+lista.length+')</h4>' +
        '<div class="lista">' + lista.map(App.cardDocumento).join('') + '</div>';
    }

    var venc = App._documentos.filter(function (x) { return x.status === 'vencido'; });
    var aten = App._documentos.filter(function (x) { return x.status === 'atencao'; });
    var ok   = App._documentos.filter(function (x) { return x.status === 'ok'; });
    var pag  = App._documentos.filter(function (x) { return x.status === 'pago'; });
    var semD = App._documentos.filter(function (x) { return x.status === 'sem-data'; });

    html += grupo('Vencidos', venc, 'r');
    html += grupo('Vencem em breve', aten, 'a');
    html += grupo('Em dia', ok, 'v');
    html += grupo('Sem data', semD, '');

    if (pag.length) {
      html += '<h4 class="hub-sec v">Quitados ('+pag.length+')</h4><div class="lista-min">' +
        pag.map(function (x) {
          return '<div class="min-item clicavel" onclick="App.formDocumento(\''+x.id+'\')">' +
            '<span class="ms">check_circle</span>' +
            '<div><b>'+U.esc(x.tipoNome)+'</b>' +
            (x.veiculoNome ? '<small>'+U.esc(x.veiculoNome)+'</small>' : '') + '</div>' +
            '<small>'+(x.valor>0?U.moeda(x.valor):'—')+'</small></div>';
        }).join('') + '</div>';
    }

    html += '<div class="acao-topo" style="margin-top:14px">' +
      '<button class="btn primario bloco-full" onclick="UI.fecharModal();App.formDocumento()">' +
      '<span class="ms">add</span> Novo documento</button></div>';

    UI.modal('Documentos', html, null);

  }).catch(function (e) {
    UI.load(false);
    UI.toast(e.message || 'Falha ao carregar documentos','erro');
  });
};

App.cardDocumento = function (d) {
  var cor = d.status === 'vencido' ? 'vermelho'
          : (d.status === 'atencao' ? 'amarelo'
          : (d.status === 'pago' ? 'verde' : 'azul'));

  var det = [];
  if (d.dataVencimento) det.push('Vence em ' + U.data(d.dataVencimento));
  if (d.numero) det.push('Nº ' + d.numero);

  var origem = d.doMotorista
    ? '<span class="tag azul"><span class="ms" style="font-size:13px">person</span>motorista</span>'
    : (d.veiculoNome
      ? '<span class="selo-veic" style="--c:'+U.hex(d.veiculoCor)+'">' +
        '<span class="ms">'+U.ico(d.veiculoTipo)+'</span>'+U.esc(d.veiculoNome)+'</span>'
      : '');

  var barra = (d.status === 'atencao' || d.status === 'vencido')
    ? '<div class="barra"><i class="'+d.status+'" style="width:'+Math.min(100,d.progresso)+'%"></i></div>'
    : '';

  var tagStatus = d.status === 'vencido' ? 'vencido'
    : (d.status === 'atencao' ? 'atencao' : (d.status === 'pago' ? 'ok' : ''));

  var acoes = d.status === 'pago'
    ? '<button onclick="App.formDocumento(\''+d.id+'\')"><span class="ms">edit</span> Editar</button>' +
      '<button onclick="App.removerDoc(\''+d.id+'\')"><span class="ms">delete</span></button>'
    : '<button class="pri-txt" onclick="App.formPagarDoc(\''+d.id+'\')">' +
      '<span class="ms">task_alt</span> Marcar como pago</button>' +
      '<button onclick="App.formDocumento(\''+d.id+'\')"><span class="ms">edit</span> Editar</button>' +
      '<button onclick="App.removerDoc(\''+d.id+'\')"><span class="ms">delete</span></button>';

  return '<div class="item" style="--c:'+(d.veiculoCor?U.hex(d.veiculoCor):'#3b82f6')+'">' +
    '<div class="av '+cor+'"><span class="ms">'+d.tipoIcone+'</span></div>' +
    '<div class="txt"><b>'+U.esc(d.tipoNome)+'</b>' + origem +
    (det.length ? '<small>'+U.esc(det.join(' · '))+'</small>' : '') +
    '<span class="tag '+tagStatus+'">'+U.esc(d.motivo)+'</span>' +
    (d.obs ? '<small>'+U.esc(d.obs)+'</small>' : '') +
    barra +
    '<div class="acoes-item">' + acoes + '</div>' +
    '</div>' +
    (d.valor > 0 ? '<div class="val"><b>'+U.moeda(d.valor)+'</b></div>' : '') +
    '</div>';
};

App.formDocumento = function (id) {
  if (!App._tiposDoc.length) {
    UI.load(true,'Carregando…');
    return api('listarTiposDocumento').then(function (t) {
      UI.load(false);
      App._tiposDoc = t || [];
      App.formDocumento(id);
    }).catch(function (e) {
      UI.load(false); UI.toast(e.message,'erro');
    });
  }

  var d = {};
  for (var i = 0; i < App._documentos.length; i++) {
    if (App._documentos[i].id === id) { d = App._documentos[i]; break; }
  }

  var tipoSel = d.tipo || 'IPVA';
  var vSel = d.veiculoId || (VEICULO_SEL !== 'todos' ? VEICULO_SEL : (DB.veiculos[0]||{}).id);

  var opTipos = App._tiposDoc.map(function (t) {
    return '<option value="'+t.id+'"'+(t.id===tipoSel?' selected':'')+'>'+t.nome+'</option>';
  }).join('');

  var html = '<div class="form">' +
    campo('Tipo de documento','<select id="dcTipo" onchange="App.aoTrocarTipoDoc()">'+opTipos+'</select>') +
    '<div id="dcBoxVeic">' + UI.seletorVeiculo('dcVeic', vSel, 'De qual veículo?') + '</div>' +
    '<p class="dica" id="dcDicaVeic"></p>' +
    '<div class="linha2">' +
      campo('Vencimento','<input id="dcVenc" type="date" value="'+(d.dataVencimento||'')+'">') +
      campo('Valor (R$)','<input id="dcValor" type="number" inputmode="decimal" step="0.01" value="'+(d.valor||'')+'">') +
    '</div>' +
    campo('Número / documento','<input id="dcNumero" value="'+U.esc(d.numero||'')+'">') +
    campo('Observações','<textarea id="dcObs">'+U.esc(d.obs||'')+'</textarea>') +
    '</div>';

  UI.modal(id ? 'Editar documento' : 'Novo documento', html, function () {
    if (!UI.v('dcVenc')) return UI.toast('Informe a data de vencimento','erro');

    var tipoAtual = UI.v('dcTipo');
    var precisaVeic = true;

    for (var j = 0; j < App._tiposDoc.length; j++) {
      if (App._tiposDoc[j].id === tipoAtual) {
        precisaVeic = App._tiposDoc[j].veiculo === 1;
        break;
      }
    }

    var reg = {
      id: id || '',
      veiculoId: precisaVeic ? UI.v('dcVeic') : '',
      tipo: tipoAtual,
      numero: UI.v('dcNumero'),
      dataVencimento: UI.v('dcVenc'),
      valor: UI.n('dcValor'),
      status: d.statusOriginal || 'PENDENTE',
      obs: UI.v('dcObs')
    };

    UI.fecharModal();
    UI.load(true,'Salvando documento…');

    api('salvar','DOCUMENTOS',reg)
      .then(function () { return App.aposSalvar('Documento salvo'); })
      .catch(function (e) { UI.load(false); UI.toast(e.message,'erro'); });
  });

  setTimeout(App.aoTrocarTipoDoc, 60);
};

App.aoTrocarTipoDoc = function () {
  var tipo = UI.v('dcTipo');
  var box = $('dcBoxVeic');
  var dica = $('dcDicaVeic');

  var t = null;
  for (var i = 0; i < App._tiposDoc.length; i++) {
    if (App._tiposDoc[i].id === tipo) { t = App._tiposDoc[i]; break; }
  }

  if (!t) return;

  if (t.veiculo) {
    if (box) box.classList.remove('oculto');
    if (dica) dica.textContent = 'Aviso ' + t.aviso + ' dias antes do vencimento.';
  } else {
    if (box) box.classList.add('oculto');
    if (dica) dica.textContent = 'Documento do motorista. Aviso ' + t.aviso + ' dias antes.';
  }
};

App.formPagarDoc = function (id) {
  var d = {};
  for (var i = 0; i < App._documentos.length; i++) {
    if (App._documentos[i].id === id) { d = App._documentos[i]; break; }
  }

  var html = '<div class="aviso verde"><span class="ms">task_alt</span><div>' +
    '<b>'+U.esc(d.tipoNome)+'</b>' +
    (d.dataVencimento ? 'Vencimento em ' + U.data(d.dataVencimento) : '') +
    '</div></div>' +
    '<div class="form">' +
    campo('Valor pago (R$)','<input id="pgValor" type="number" inputmode="decimal" step="0.01" value="'+(d.valor||'')+'">');

  if (d.recorrente) {
    html += '<div class="switch"><span>Já criar o do próximo período</span>' +
      '<input type="checkbox" id="pgProximo" checked onchange="App.togglProximoDoc()"></div>' +
      '<div id="pgBoxProximo">' +
      '<div class="linha2">' +
        campo('Daqui a','<select id="pgMeses">' +
          '<option value="12" selected>12 meses</option>' +
          '<option value="6">6 meses</option>' +
          '<option value="3">3 meses</option>' +
          '<option value="1">1 mês</option></select>') +
        campo('Valor estimado','<input id="pgValorProx" type="number" step="0.01" value="'+(d.valor||'')+'">') +
      '</div></div>';
  }

  html += campo('Observações','<textarea id="pgObs" placeholder="Ex.: pago no débito automático"></textarea>') +
    '</div>';

  UI.modal('Marcar como pago', html, function () {
    var dados = {
      valor: UI.n('pgValor'),
      obs: UI.v('pgObs'),
      gerarProximo: d.recorrente ? UI.chk('pgProximo') : false,
      mesesProximo: d.recorrente ? UI.n('pgMeses') : 0,
      valorProximo: d.recorrente ? UI.n('pgValorProx') : 0
    };

    UI.fecharModal();
    UI.load(true,'Registrando pagamento…');

    api('pagarDocumento', id, dados).then(function (r) {
      var msg = r.tipo + ' quitado';
      if (r.proximoVencimento) {
        msg += ' · próximo em ' + U.data(r.proximoVencimento);
      }
      return App.aposSalvar(msg);
    }).catch(function (e) {
      UI.load(false); UI.toast(e.message,'erro');
    });
  }, 'Confirmar pagamento');
};

App.togglProximoDoc = function () {
  var box = $('pgBoxProximo');
  if (box) box.className = UI.chk('pgProximo') ? '' : 'esmaecido';
};

App.removerDoc = function (id) {
  UI.confirmar({
    titulo: 'Excluir documento',
    mensagem: 'Este documento será excluído permanentemente. Esta ação não pode ser desfeita.',
    textoBotao: 'Excluir documento',
    icone: 'delete',
    aoConfirmar: function () {
      UI.load(true,'Excluindo…');
      api('excluir','DOCUMENTOS',id)
        .then(function () { return App.aposSalvar('Documento excluído'); })
        .catch(function (e) { UI.load(false); UI.toast(e.message,'erro'); });
    }
  });
};

App.docsPadrao = function () {
  if (!U.temVeiculo()) return;

  var vId = VEICULO_SEL !== 'todos' ? VEICULO_SEL : DB.veiculos[0].id;

  UI.load(true,'Montando sugestões…');

  api('previewDocumentosPadrao', vId).then(function (d) {
    UI.load(false);

    if (!d.sugestoes || !d.sugestoes.length) {
      return UI.toast('Este veículo já tem os documentos principais','ok');
    }

    var lista = d.sugestoes.map(function (s, i) {
      return '<label class="plano-item"><input type="checkbox" class="dc-chk" checked data-i="'+i+'">' +
        '<div><b>'+U.esc(s.nome)+'</b><small>vencimento estimado no mês '+s.mes+'</small></div>' +
        '<span class="ms pl-ok">check_circle</span></label>';
    }).join('');

    App._docsSugeridos = d.sugestoes;
    App._docsVeiculo = vId;

    var html = '<div class="aviso info"><span class="ms">auto_awesome</span><div>' +
      '<b>Documentos de '+U.esc(d.veiculoNome)+'</b>' +
      'Você poderá ajustar as datas e valores depois.</div></div>' +
      '<div class="plano-lista">'+lista+'</div>' +
      '<p class="dica">A CNH deve ser cadastrada separadamente, ' +
      'pois pertence ao motorista.</p>';

    UI.modal('Sugerir documentos', html, function () {
      var marcados = [];
      [].forEach.call(document.querySelectorAll('.dc-chk'), function (c) {
        if (c.checked) marcados.push(App._docsSugeridos[parseInt(c.getAttribute('data-i'),10)]);
      });

      if (!marcados.length) { UI.fecharModal(); return UI.toast('Nenhum item selecionado','erro'); }

      UI.fecharModal();
      UI.load(true,'Criando documentos…');

      api('criarDocumentosPadrao', App._docsVeiculo, marcados)
        .then(function (n) { return App.aposSalvar(n + ' documento(s) criado(s)'); })
        .catch(function (e) { UI.load(false); UI.toast(e.message,'erro'); });
    }, 'Criar');

  }).catch(function (e) {
    UI.load(false); UI.toast(e.message,'erro');
  });
};

/* ==================== DEPRECIACAO E CUSTO DE POSSE ==================== */

App.custoDePosseUI = function (veiculoId) {
  var v = U.veic(veiculoId);
  if (!v) return;

  UI.load(true, 'Calculando custo de posse…');

  api('custoDePosse', veiculoId, 12).then(function (d) {
    UI.load(false);

    var badge, disclaimer;

    if (d.metodoDepreciacao === 'FIPE_REAL') {
      badge = '<span class="tag ok">Depreciação real · FIPE</span>';
      disclaimer = 'Calculada pela variação real do valor deste veículo na tabela FIPE ' +
        'nos últimos 12 meses.';
    } else if (d.metodoDepreciacao === 'FIPE_MEDIA') {
      badge = '<span class="tag atencao">Estimativa · média FIPE</span>';
      disclaimer = 'Estimativa baseada na depreciação média histórica da FIPE para veículos ' +
        'deste tipo. Não representa o valor real pago por este veículo.';
    } else {
      badge = '<span class="tag">Sem dados</span>';
      disclaimer = d.avisoDepreciacao ||
        'Vincule este veículo à tabela FIPE ou informe um valor de referência ' +
        'para incluir a depreciação no custo de posse.';
    }

    var difDep = Number(d.depreciacao) || 0;

    var html = '<div class="veic-unico" style="--c:'+U.hex(v.cor)+'">' +
      '<span class="ms">'+U.ico(v.tipo)+'</span>' +
      '<div><b>'+U.esc(v.nome)+'</b><small>Custo de posse · últimos 12 meses</small></div></div>' +

      '<div class="divisao">' +
        '<div class="div-lin"><span><i class="dot azul"></i>Combustível</span><b>'+U.moeda(d.combustivel)+'</b></div>' +
        '<div class="div-lin"><span><i class="dot roxo"></i>Manutenção</span><b>'+U.moeda(d.manutencao)+'</b></div>' +
        '<div class="div-lin"><span><i class="dot verde"></i>Despesas</span><b>'+U.moeda(d.despesas)+'</b></div>' +
        '<div class="div-lin"><span><i class="dot" style="background:#f59e0b"></i>Depreciação</span><b>' +
          (difDep < 0
            ? '+' + U.moeda(Math.abs(difDep)) + ' (valorizou)'
            : U.moeda(difDep)) +
        '</b></div>' +
        '<div class="div-lin" style="border-top:2px solid var(--linha);margin-top:4px">' +
        '<span style="color:var(--txt)">Total</span><b style="font-size:15px">'+U.moeda(d.total)+'</b></div>' +
      '</div>' +

      '<div class="hub-resumo" style="margin-top:12px">' +
        '<div class="hr-item"><b>'+U.moeda(d.porMes)+'</b><small>por mês</small></div>' +
      '</div>' +

      '<div style="margin-top:12px">' + badge + '</div>' +
      '<p class="dica" style="margin-top:8px">'+U.esc(disclaimer)+'</p>' +

      (d.metodoDepreciacao !== 'FIPE_REAL'
        ? '<div class="acao-topo" style="margin-top:10px">' +
          '<button class="btn ghost bloco-full" onclick="UI.fecharModal();App.formVeiculo(false,\''+veiculoId+'\')">' +
          '<span class="ms">auto_awesome</span> Vincular à FIPE</button></div>'
        : '');

    UI.modal('Custo de posse', html, null);

  }).catch(function (e) {
    UI.load(false);
    UI.toast(e.message,'erro');
  });
};

/* ==================== MEUS VEICULOS ==================== */

App.renderVeiculos = function () {
  if (!temEl('listaVeiculos')) return;
  if (!DB.veiculos.length) {
    setHTML('resumoVeiculos','');
    setHTML('listaVeiculos', UI.vazio('directions_car','Nenhum veículo cadastrado.'));
    return;
  }
  if (U.multi()) {
    var totGeral = 0;
    DB.veiculos.forEach(function (v) { totGeral += v.gastoTotal||0; });
    setHTML('resumoVeiculos',
      '<div class="kpi x"><span class="ms">garage</span><b>'+DB.veiculos.length+'</b><span class="lbl">Veículos</span></div>' +
      '<div class="kpi v"><span class="ms">payments</span><b>'+U.moeda(totGeral)+'</b><span class="lbl">Gasto somado</span></div>');
  } else setHTML('resumoVeiculos','');

  var html = DB.veiculos.map(function (v) {
    var c = v.consumo || {};
    return '<div class="card-veic" style="--c:'+U.hex(v.cor)+'">' +
      '<div class="cv-topo"><div class="cv-ico"><span class="ms">'+U.ico(v.tipo)+'</span></div>' +
      '<div class="cv-id"><b>'+U.esc(v.nome)+'</b>' +
      '<small>'+U.esc([v.marca,v.modelo,v.ano||''].filter(function(x){return x;}).join(' '))+'</small>' +
      '<span class="placa">'+U.esc(v.placa||'sem placa')+'</span></div>' +
      (v.alertas ? '<span class="cv-alerta'+(v.vencidos?' urg':'')+'">'+v.alertas+'</span>' : '<span class="ms cv-ok">verified</span>') +
      '</div><div class="cv-nums">' +
        '<div><b>'+U.num(v.kmAtual)+'</b><small>KM ATUAL</small></div>' +
        '<div><b>'+(c.mediaKmL||'—')+'</b><small>KM/L</small></div>' +
        '<div><b>'+U.num(v.autonomia)+'</b><small>KM/TANQUE</small></div></div>' +
      '<div class="cv-chips">' +
        '<span><span class="ms">local_gas_station</span>'+v.qtdAbastecimentos+' abast.</span>' +
        '<span><span class="ms">build</span>'+v.qtdManutencoes+' manut.</span>' +
        '<span><span class="ms">luggage</span>'+v.qtdViagens+' viagens</span>' +
        '<span><span class="ms">payments</span>'+U.moeda(v.gastoTotal)+'</span>' +
        (v.fipeValor > 0
          ? '<span class="chip-fipe"><span class="ms">sell</span>' + U.moeda(v.fipeValor) + ' FIPE</span>'
          : '') +
        '</div>' +
      '<div class="cv-acoes">' +
        '<button onclick="App.formAbastecimento(\''+v.id+'\')"><span class="ms">local_gas_station</span>Abastecer</button>' +
        '<button onclick="App.formManutencao({veiculoId:\''+v.id+'\'})"><span class="ms">build</span>Manutenção</button>' +
        '<button onclick="App.verManutencaoVeiculo(\''+v.id+'\')"><span class="ms">history</span>Revisões</button></div>' +
      '<div class="cv-acoes sec">' +
        '<button onclick="App.formVeiculo(false,\''+v.id+'\')"><span class="ms">edit</span>Editar</button>' +
        '<button onclick="App.planoPadrao(\''+v.id+'\')"><span class="ms">auto_awesome</span>Plano</button>' +
        (v.fipeCodigo
          ? '<button onclick="App.atualizarFipe(\''+v.id+'\')"><span class="ms">update</span>FIPE</button>'
          : '<button onclick="App.pdfManutencao(\''+v.id+'\')"><span class="ms">picture_as_pdf</span>PDF</button>') +
        '<button onclick="App.custoDePosseUI(\''+v.id+'\')"><span class="ms">monitoring</span>Custo</button>' +
        '<button onclick="App.hubDocumentos()"><span class="ms">folder_shared</span>Docs</button>' +
        '<button onclick="App.excluirVeiculo(\''+v.id+'\')"><span class="ms">delete</span></button></div></div>';
  }).join('');
  if (U.multi()) {
    html += '<div class="acao-topo" style="margin-top:6px">' +
      '<button class="btn ghost bloco-full" onclick="App.pdfFrota()">' +
      '<span class="ms">compare_arrows</span> Comparativo em PDF</button></div>';
  }
  setHTML('listaVeiculos', html);
};

App.verManutencaoVeiculo = function (id) {
  VEICULO_SEL = id;
  App.montarSeletor(); App.render();
  App.irPara('manutencao'); App.trocarAba('monitor');
};

/* ==================== CADASTRO DE VEICULO (com FIPE) ==================== */

App._fipe = {
  tipo: '', marcas: [], modelos: [], anos: [],
  marcaCodigo: '', modeloCodigo: '', anoCodigo: '', detalhe: null
};

App.formVeiculo = function (primeiro, id) {
  if (!APP_PRONTO) return UI.toast('Aguarde o app carregar…','erro');

  var v = id ? (DB.veiculos.filter(function(x){return x.id===id;})[0] || {}) : {};
  var tipoSel = v.tipo || 'carro';
  var corSel = v.cor || ((DB.cores[(DB.veiculos.length) % DB.cores.length] || DB.cores[0]) || {id:'azul'}).id;

  App._fipe = {
    tipo: tipoSel, marcas: [], modelos: [], anos: [],
    marcaCodigo: v.fipeMarcaCodigo || '',
    modeloCodigo: v.fipeModeloCodigo || '',
    anoCodigo: v.fipeAnoCodigo || '',
    detalhe: null
  };

  var tiposHtml = (DB.tipos||[]).map(function (t) {
    return '<div class="tipo-card'+(t.id===tipoSel?' sel':'')+'" data-tipo="'+t.id+'" data-tanque="'+t.tanque+'" ' +
      'onclick="App.selTipo(this)"><span class="ms">'+t.icone+'</span><small>'+t.nome+'</small></div>';
  }).join('');

  var coresHtml = (DB.cores||[]).map(function (c) {
    return '<div class="cor-bolha'+(c.id===corSel?' sel':'')+'" data-cor="'+c.id+'" ' +
      'style="background:'+c.hex+'" onclick="App.selCor(this)"><span class="ms">check</span></div>';
  }).join('');

  var html = '<div class="form">' +
    (primeiro ? '<div class="aviso info"><span class="ms">waving_hand</span><div><b>Bem-vindo!</b>Cadastre seu veículo.</div></div>' : '') +

    '<div><label>Tipo de veículo</label><div class="tipo-cards" id="tipoCards">'+tiposHtml+'</div>' +
    '<input type="hidden" id="fTipo" value="'+tipoSel+'"></div>' +

    '<div class="fipe-box">' +
      '<div class="fipe-cab">' +
        '<span class="ms">auto_awesome</span>' +
        '<div><b>Preencher pela tabela FIPE</b>' +
        '<small>Escolha e os campos se preenchem sozinhos</small></div>' +
        '<button type="button" class="link-btn" onclick="App.alternarFipe()" id="fipeToggle">usar</button>' +
      '</div>' +
      '<div id="fipeCampos" class="oculto">' +
        '<div id="fipeMarca">' +
          campo('Marca','<select id="fpMarca" disabled><option>carregando…</option></select>') +
        '</div>' +
        '<div id="fipeModelo" class="esmaecido">' +
          campo('Modelo','<select id="fpModelo" disabled><option>escolha a marca</option></select>') +
        '</div>' +
        '<div id="fipeAno" class="esmaecido">' +
          campo('Ano','<select id="fpAno" disabled><option>escolha o modelo</option></select>') +
        '</div>' +
        '<div id="fipeResultado"></div>' +
      '</div>' +
    '</div>' +

    campo('Nome / apelido','<input id="fNome" value="'+U.esc(v.nome)+'" placeholder="Ex.: Meu carro">') +

    '<div><label>Cor de identificação</label><div class="cor-bolhas" id="corBolhas">'+coresHtml+'</div>' +
    '<input type="hidden" id="fCor" value="'+corSel+'"></div>' +

    '<div class="linha2">' +
      campo('Placa','<input id="fPlaca" value="'+U.esc(v.placa)+'" placeholder="ABC1D23" style="text-transform:uppercase">') +
      campo('Ano','<input id="fAno" type="number" inputmode="numeric" value="'+(v.ano||'')+'">') + '</div>' +

    '<div class="linha2">' +
      campo('Marca','<input id="fMarca" value="'+U.esc(v.marca)+'">') +
      campo('Modelo','<input id="fModelo" value="'+U.esc(v.modelo)+'">') + '</div>' +

    '<div class="linha2">' +
      campo('Combustível','<select id="fComb">'+['Gasolina','Etanol','Flex','Diesel S10','Diesel S500','GNV','Elétrico']
        .map(function(c){ return '<option'+(v.combustivel===c?' selected':'')+'>'+c+'</option>'; }).join('')+'</select>') +
      campo('Tanque (L)','<input id="fTanque" type="number" inputmode="decimal" step="0.1" value="'+(v.tanque||'')+'" placeholder="50">') + '</div>' +

    '<p class="dica">O tanque é essencial para calcular a autonomia e as paradas nas viagens.</p>' +

    campo('KM atual do painel','<input id="fKmIni" type="number" inputmode="numeric" value="'+(v.kmAtual||v.kmInicial||'')+'">') +

    campo('Valor de referência (R$) · opcional',
      '<input id="fValorRef" type="number" inputmode="decimal" step="100" ' +
      'value="'+(v.valorReferencia||'')+'" placeholder="Ex.: 25000">') +
    '<p class="dica">Usado apenas para estimar a depreciação quando o veículo não está ' +
    'vinculado à tabela FIPE. Não é o valor de compra.</p>' +

    '<input type="hidden" id="fFipeCodigo" value="'+U.esc(v.fipeCodigo||'')+'">' +
    '<input type="hidden" id="fFipeValor" value="'+(v.fipeValor||'')+'">' +
    '<input type="hidden" id="fFipeMarcaCod" value="'+U.esc(v.fipeMarcaCodigo||'')+'">' +
    '<input type="hidden" id="fFipeModeloCod" value="'+U.esc(v.fipeModeloCodigo||'')+'">' +
    '<input type="hidden" id="fFipeAnoCod" value="'+U.esc(v.fipeAnoCodigo||'')+'">' +
    '<input type="hidden" id="fFipeRef" value="'+U.esc(v.fipeReferencia||'')+'">' +
    '</div>';

  UI.modal(id?'Editar veículo':'Cadastrar veículo', html, function () {
    if (!UI.v('fNome')) return UI.toast('Informe o nome do veículo','erro');

    var reg = {
      id: id||'',
      nome: UI.v('fNome'),
      placa: UI.v('fPlaca').toUpperCase(),
      marca: UI.v('fMarca'),
      modelo: UI.v('fModelo'),
      ano: UI.n('fAno'),
      tipo: UI.v('fTipo'),
      cor: UI.v('fCor'),
      combustivel: UI.v('fComb'),
      tanque: UI.n('fTanque'),
      kmInicial: UI.n('fKmIni'),
      ativo: 'SIM',
      valorReferencia: UI.n('fValorRef'),
      fipeCodigo: UI.v('fFipeCodigo'),
      fipeValor: UI.n('fFipeValor'),
      fipeMarcaCodigo: UI.v('fFipeMarcaCod'),
      fipeModeloCodigo: UI.v('fFipeModeloCod'),
      fipeAnoCodigo: UI.v('fFipeAnoCod'),
      fipeReferencia: UI.v('fFipeRef'),
      fipeAtualizadoEm: UI.v('fFipeCodigo') ? U.hoje() : ''
    };

    var novo = !id;

    UI.fecharModal();
    UI.load(true,'Salvando veículo…');

    api('salvar','Veiculos',reg).then(function (r) {
      var v2 = r.registro;
      return App.aposSalvar('Veículo salvo', function () {
        if (novo && v2 && v2.id) {
          VEICULO_SEL = v2.id;
          App.montarSeletor();
          App.render();
          setTimeout(function () { App.planoPadrao(v2.id, true); }, 350);
        }
      });
    }).catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  });

  if (v.fipeCodigo) {
    setTimeout(function () {
      App.alternarFipe();
      setHTML('fipeResultado',
        '<div class="fipe-ok"><span class="ms">verified</span><div>' +
        '<b>'+U.esc(v.marca+' '+v.modelo)+'</b>' +
        '<small>Código FIPE '+U.esc(v.fipeCodigo)+
        (v.fipeValor > 0 ? ' · '+U.moeda(v.fipeValor) : '') + '</small>' +
        '</div></div>');
    }, 100);
  }
};

App.alternarFipe = function () {
  var box = $('fipeCampos');
  var btn = $('fipeToggle');
  if (!box) return;

  var aberto = !box.classList.contains('oculto');

  if (aberto) {
    box.classList.add('oculto');
    if (btn) btn.textContent = 'usar';
    return;
  }

  box.classList.remove('oculto');
  if (btn) btn.textContent = 'ocultar';

  App.carregarMarcasFipe();
};

App.carregarMarcasFipe = function () {
  var tipo = UI.v('fTipo') || 'carro';

  if (App._fipe.tipo === tipo && App._fipe.marcas.length) {
    App.montarSelectMarcas();
    return;
  }

  var sel = $('fpMarca');
  if (sel) { sel.disabled = true; sel.innerHTML = '<option>carregando…</option>'; }

  api('fipeMarcas', tipo).then(function (d) {
    App._fipe.tipo = tipo;
    App._fipe.marcas = d.marcas || [];
    App.montarSelectMarcas();
  }).catch(function (e) {
    if (sel) sel.innerHTML = '<option>indisponível</option>';
    setHTML('fipeResultado',
      '<div class="fipe-erro"><span class="ms">error</span>' +
      U.esc(e.message || 'FIPE indisponível') + '</div>');
  });
};

App.montarSelectMarcas = function () {
  var sel = $('fpMarca');
  if (!sel) return;

  sel.disabled = false;
  sel.setAttribute('onchange', 'App.aoEscolherMarcaFipe()');

  sel.innerHTML = '<option value="">Selecione a marca</option>' +
    App._fipe.marcas.map(function (m) {
      return '<option value="'+m.codigo+'"'+
        (m.codigo === App._fipe.marcaCodigo ? ' selected' : '')+'>'+
        U.esc(m.nome)+'</option>';
    }).join('');

  if (App._fipe.marcaCodigo) App.aoEscolherMarcaFipe();
};

App.aoEscolherMarcaFipe = function () {
  var codigo = UI.v('fpMarca');

  App._fipe.marcaCodigo = codigo;
  App._fipe.modelos = [];
  App._fipe.anos = [];

  var boxModelo = $('fipeModelo');
  var boxAno = $('fipeAno');
  var selAno = $('fpAno');

  if (boxAno) boxAno.className = 'esmaecido';
  if (selAno) { selAno.disabled = true; selAno.innerHTML = '<option>escolha o modelo</option>'; }

  setHTML('fipeResultado','');

  if (!codigo) {
    if (boxModelo) boxModelo.className = 'esmaecido';
    var sm = $('fpModelo');
    if (sm) { sm.disabled = true; sm.innerHTML = '<option>escolha a marca</option>'; }
    return;
  }

  if (boxModelo) boxModelo.className = '';

  var sel = $('fpModelo');
  if (sel) { sel.disabled = true; sel.innerHTML = '<option>carregando…</option>'; }

  api('fipeModelos', UI.v('fTipo'), codigo).then(function (d) {
    App._fipe.modelos = d.modelos || [];

    if (!sel) return;

    sel.disabled = false;
    sel.setAttribute('onchange', 'App.aoEscolherModeloFipe()');

    sel.innerHTML = '<option value="">Selecione o modelo</option>' +
      App._fipe.modelos.map(function (m) {
        return '<option value="'+m.codigo+'"'+
          (m.codigo === App._fipe.modeloCodigo ? ' selected' : '')+'>'+
          U.esc(m.nome)+'</option>';
      }).join('');

    if (App._fipe.modeloCodigo) App.aoEscolherModeloFipe();

  }).catch(function (e) {
    if (sel) sel.innerHTML = '<option>erro ao carregar</option>';
    UI.toast(e.message,'erro');
  });
};

App.aoEscolherModeloFipe = function () {
  var codigo = UI.v('fpModelo');

  App._fipe.modeloCodigo = codigo;
  App._fipe.anos = [];

  var boxAno = $('fipeAno');
  setHTML('fipeResultado','');

  if (!codigo) {
    if (boxAno) boxAno.className = 'esmaecido';
    var sa = $('fpAno');
    if (sa) { sa.disabled = true; sa.innerHTML = '<option>escolha o modelo</option>'; }
    return;
  }

  if (boxAno) boxAno.className = '';

  var sel = $('fpAno');
  if (sel) { sel.disabled = true; sel.innerHTML = '<option>carregando…</option>'; }

  api('fipeAnos', UI.v('fTipo'), App._fipe.marcaCodigo, codigo).then(function (d) {
    App._fipe.anos = d.anos || [];

    if (!sel) return;

    sel.disabled = false;
    sel.setAttribute('onchange', 'App.aoEscolherAnoFipe()');

    sel.innerHTML = '<option value="">Selecione o ano</option>' +
      App._fipe.anos.map(function (a) {
        return '<option value="'+a.codigo+'"'+
          (a.codigo === App._fipe.anoCodigo ? ' selected' : '')+'>'+
          U.esc(a.nome)+'</option>';
      }).join('');

    if (App._fipe.anoCodigo) App.aoEscolherAnoFipe();

  }).catch(function (e) {
    if (sel) sel.innerHTML = '<option>erro ao carregar</option>';
    UI.toast(e.message,'erro');
  });
};

App.aoEscolherAnoFipe = function () {
  var codigo = UI.v('fpAno');

  App._fipe.anoCodigo = codigo;

  if (!codigo) { setHTML('fipeResultado',''); return; }

  setHTML('fipeResultado',
    '<div class="fipe-carregando"><i class="mini-loader"></i> Buscando na FIPE…</div>');

  api('fipeDetalhe', UI.v('fTipo'), App._fipe.marcaCodigo,
      App._fipe.modeloCodigo, codigo).then(function (d) {

    App._fipe.detalhe = d;

    var cMarca = $('fMarca');   if (cMarca) cMarca.value = d.marca;
    var cModelo = $('fModelo'); if (cModelo) cModelo.value = d.modelo;
    var cAno = $('fAno');       if (cAno) cAno.value = d.ano;

    var cNome = $('fNome');
    if (cNome && !cNome.value) cNome.value = d.modelo.split(' ')[0];

    api('fipeCombustivelCarWay', d.combustivel).then(function (comb) {
      var cb = $('fComb');
      if (cb) {
        for (var i = 0; i < cb.options.length; i++) {
          if (cb.options[i].value === comb) { cb.selectedIndex = i; break; }
        }
      }
    }).catch(function () {});

    var set = function (id, valor) { var e = $(id); if (e) e.value = valor; };

    set('fFipeCodigo', d.codigoFipe);
    set('fFipeValor', d.valor);
    set('fFipeMarcaCod', d.marcaCodigo);
    set('fFipeModeloCod', d.modeloCodigo);
    set('fFipeAnoCod', d.anoCodigo);
    set('fFipeRef', d.mesReferencia);

    setHTML('fipeResultado',
      '<div class="fipe-ok"><span class="ms">verified</span><div>' +
      '<b>'+U.esc(d.marca+' '+d.modelo)+'</b>' +
      '<small>'+d.ano+' · '+U.esc(d.combustivel)+'</small>' +
      '<small class="fipe-valor">Valor FIPE '+U.esc(d.valorTexto)+'</small>' +
      '<small>Referência '+U.esc(d.mesReferencia)+'</small>' +
      '</div></div>');

  }).catch(function (e) {
    setHTML('fipeResultado',
      '<div class="fipe-erro"><span class="ms">error</span>' +
      U.esc(e.message || 'Não consegui buscar na FIPE') + '</div>');
  });
};

App.selTipo = function (el) {
  [].forEach.call(document.querySelectorAll('#tipoCards .tipo-card'), function(c){ c.classList.remove('sel'); });
  el.classList.add('sel');

  var novoTipo = el.getAttribute('data-tipo');

  var f = $('fTipo'); if (f) f.value = novoTipo;

  var t = $('fTanque');
  if (t && !t.value) t.value = el.getAttribute('data-tanque');

  var box = $('fipeCampos');
  if (box && !box.classList.contains('oculto')) {
    App._fipe.marcaCodigo = '';
    App._fipe.modeloCodigo = '';
    App._fipe.anoCodigo = '';
    App._fipe.marcas = [];
    setHTML('fipeResultado','');
    App.carregarMarcasFipe();
  }
};

App.atualizarFipe = function (veiculoId) {
  UI.load(true,'Consultando a FIPE…');

  api('atualizarValorFipe', veiculoId).then(function (r) {
    UI.load(false);

    var msg = U.moeda(r.valorAtual) + ' · ' + r.referencia;

    if (r.variacao !== 0 && r.valorAnterior > 0) {
      msg += ' · ' + (r.variacao > 0 ? '+' : '') + U.moeda(r.variacao);
    }

    UI.toast(msg, 'ok');
    return App.carregar();

  }).catch(function (e) {
    UI.load(false);
    UI.toast(e.message,'erro');
  });
};

App.selCor = function (el) {
  [].forEach.call(document.querySelectorAll('#corBolhas .cor-bolha'), function(c){ c.classList.remove('sel'); });
  el.classList.add('sel');
  var f = $('fCor'); if (f) f.value = el.getAttribute('data-cor');
};

App.planoPadrao = function (veiculoId, aposCadastro) {
  var v = U.veic(veiculoId);
  if (!v) return UI.toast('Veículo não encontrado','erro');
  UI.load(true, 'Montando o plano sugerido…');
  api('previewPlanoPadrao', v.tipo).then(function (itens) {
    UI.load(false);
    itens = itens || [];
    var jaTem = (DB.planos||[]).filter(function (p) { return p.veiculoId === veiculoId; }).length;
    var cabec = aposCadastro
      ? '<div class="aviso verde"><span class="ms">check_circle</span><div><b>'+U.esc(v.nome)+' cadastrado!</b>' +
        'Plano típico para <b>'+U.esc(U.nomeTipo(v.tipo).toLowerCase())+'</b>.</div></div>'
      : '<div class="aviso info"><span class="ms">event_repeat</span><div><b>Plano de revisões</b>' +
        (jaTem ? 'Você já tem '+jaTem+' item(ns).' : 'Marque o que quiser monitorar.') + '</div></div>';
    var cabVeic = '<div class="veic-unico" style="--c:'+U.hex(v.cor)+'">' +
      '<span class="ms">'+U.ico(v.tipo)+'</span>' +
      '<div><b>'+U.esc(v.nome)+'</b><small>a partir de '+U.num(v.kmAtual)+' km</small></div></div>';
    var lista = itens.map(function (it, i) {
      var det = [];
      if (it.intervaloKm > 0) det.push('a cada '+U.num(it.intervaloKm)+' km');
      if (it.intervaloMeses > 0) det.push(it.intervaloMeses+' meses');
      return '<label class="plano-item"><input type="checkbox" class="pl-chk" checked data-i="'+i+'">' +
        '<div><b>'+U.esc(it.item)+'</b><small>'+det.join(' ou ')+'</small></div>' +
        '<span class="ms pl-ok">check_circle</span></label>';
    }).join('');
    var html = cabec + cabVeic +
      '<div class="plano-acoes">' +
        '<button type="button" class="link-btn" onclick="App.marcarTodos(true)"><span class="ms">select_all</span>Marcar todos</button>' +
        '<button type="button" class="link-btn" onclick="App.marcarTodos(false)"><span class="ms">deselect</span>Desmarcar</button>' +
        '<span class="plano-conta" id="planoConta">'+itens.length+' selecionados</span></div>' +
      '<div class="plano-lista" id="planoLista">'+lista+'</div>';
    App._planoItens = itens; App._planoVeic = veiculoId;
    UI.modal(aposCadastro ? 'Plano de revisões' : 'Criar plano de revisões', html, function () {
      var marcados = [];
      [].forEach.call(document.querySelectorAll('#planoLista .pl-chk'), function (c) {
        if (c.checked) marcados.push(App._planoItens[parseInt(c.getAttribute('data-i'),10)]);
      });
      if (!marcados.length) { UI.fecharModal(); return UI.toast('Nenhum item selecionado','erro'); }
      UI.fecharModal(); UI.load(true,'Criando plano…');
      api('criarPlanoPadrao', App._planoVeic, v.kmAtual, v.tipo, marcados)
        .then(function (n) { return App.aposSalvar(n ? n+' item(ns) adicionados' : 'Esses itens já existiam'); })
        .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
    }, 'Criar plano');
    setTimeout(App.contarPlano, 50);
    var lst = $('planoLista');
    if (lst) lst.addEventListener('change', App.contarPlano);
  }).catch(function (e) { UI.load(false); UI.toast(e.message,'erro'); });
};

App.marcarTodos = function (val) {
  [].forEach.call(document.querySelectorAll('#planoLista .pl-chk'), function (c) { c.checked = val; });
  App.contarPlano();
};
App.contarPlano = function () {
  var n = 0;
  [].forEach.call(document.querySelectorAll('#planoLista .pl-chk'), function (c) { if (c.checked) n++; });
  setTexto('planoConta', n + (n===1 ? ' selecionado' : ' selecionados'));
};

App.excluirVeiculo = function (id) {
  var v = U.veic(id); if (!v) return;
  var html = '<div class="aviso"><span class="ms">warning</span><div><b>Excluir '+U.esc(v.nome)+'?</b>' +
    'Serão apagados '+v.qtdAbastecimentos+' abastecimento(s), '+v.qtdManutencoes+' manutenção(ões) e ' +
    v.qtdViagens+' viagem(ns).</div></div><div class="form">' +
    campo('Digite EXCLUIR para confirmar','<input id="fConf" placeholder="EXCLUIR" style="text-transform:uppercase">') + '</div>';
  UI.modal('Excluir veículo', html, function () {
    if (UI.v('fConf').toUpperCase() !== 'EXCLUIR') return UI.toast('Digite EXCLUIR','erro');
    UI.fecharModal(); UI.load(true,'Excluindo…');
    api('excluirVeiculo', id).then(function () {
      VEICULO_SEL='todos';
      return App.aposSalvar('Veículo excluído');
    }).catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  }, 'Excluir tudo');
};

App.remover = function (tabela, id) {
  UI.confirmar({
    titulo: 'Excluir registro',
    mensagem: 'Este registro será excluído permanentemente. Esta ação não pode ser desfeita.',
    textoBotao: 'Excluir',
    icone: 'delete',
    aoConfirmar: function () {
      UI.load(true,'Excluindo…');
      api('excluir', tabela, id)
        .then(function(){ return App.aposSalvar('Registro excluído'); })
        .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
    }
  });
};

/* ==================== ABASTECIMENTO ==================== */

App.renderAbastecimentos = function () {
  if (!temEl('listaAbastecimentos')) return;
  var todos = U.ordData(U.filtraVeic(DB.abastecimentos));
  var deViagem = todos.filter(function (a) { return a.viagemId; });
  var rotina = todos.filter(function (a) { return !a.viagemId; });
  var g=0, gv=0, gr=0, lt=0;
  todos.forEach(function (a) {
    var val = Number(a.valorTotal)||0;
    if (val <= 0) val = (Number(a.litros)||0)*(Number(a.precoLitro)||0);
    g += val; lt += Number(a.litros)||0;
    if (a.viagemId) { gv += val; } else gr += val;
  });
  var med = 0, n = 0;
  (VEICULO_SEL==='todos'?DB.veiculos:DB.veiculos.filter(function(v){return v.id===VEICULO_SEL;}))
    .forEach(function (v) { if (v.consumo && v.consumo.mediaKmL>0) { med += v.consumo.mediaKmL; n++; } });
  setHTML('resumoConsumo',
    '<div class="kpi"><span class="ms">payments</span><b>'+U.moeda(g)+'</b><span class="lbl">Total · '+U.num(lt,1)+' L</span></div>' +
    '<div class="kpi x"><span class="ms">luggage</span><b>'+U.moeda(gv)+'</b><span class="lbl">Em viagens</span></div>' +
    '<div class="kpi v"><span class="ms">home</span><b>'+U.moeda(gr)+'</b><span class="lbl">Dia a dia</span></div>' +
    '<div class="kpi a"><span class="ms">speed</span><b>'+(n?(med/n).toFixed(2):'—')+' <small>km/L</small></b><span class="lbl">Média</span></div>');

  var v = U.veicAtual(), ex = $('explicaConsumo');
  if (ex && v && v.consumo && VEICULO_SEL !== 'todos') {
    var c = v.consumo;
    ex.classList.remove('oculto');
    if (c.metodo === 'aguardando' || c.metodo === 'sem-dados') {
      ex.className = 'aviso';
      ex.innerHTML = '<span class="ms">info</span><div><b>Ainda não dá para calcular</b>' +
        (c.abastecimentos ? 'Registre o próximo abastecimento com o KM do painel.' : 'Registre o primeiro abastecimento.') + '</div>';
    } else {
      ex.className = 'aviso info';
      ex.innerHTML = '<span class="ms">calculate</span><div><b>Consumo de '+U.esc(v.nome)+'</b>' +
        (c.metodo==='tanque-cheio'
          ? c.completos+' tanque(s) cheio(s) — <b>'+c.mediaTanqueCheio+' km/L</b>.'
          : U.num(c.kmPercorrido)+' km ÷ '+c.litrosUsados+' L = <b>'+c.mediaAcumulada+' km/L</b>.') +
        (c.trechosDescartados ? '<br><b>'+c.trechosDescartados+' trecho(s) ignorado(s)</b> — consumo fora de '+
          c.limiteMin+'–'+c.limiteMax+' km/L.' : '') + '</div>';
    }
  } else if (ex) { ex.classList.add('oculto'); }

  function render(lista, alvo, vazioTxt) {
    setHTML(alvo, lista.length ? lista.map(function (a) {
      var cheio = String(a.tanqueCheio).toUpperCase()==='SIM';
      var vg = a.viagemId ? U.viagem(a.viagemId) : null;
      var cor = U.hexVeic(a.veiculoId);
      return '<div class="item"><div class="av" style="background:'+cor+'22;color:'+cor+'">' +
        '<span class="ms">local_gas_station</span></div>' +
        '<div class="txt"><b>'+U.num(a.litros,2)+' L · '+U.moeda(a.valorTotal)+'</b>' +
        (U.multi() && VEICULO_SEL==='todos' ? U.selo(a.veiculoId) : '') +
        '<small>'+U.data(a.data)+' · '+U.num(a.km)+' km · '+U.esc(a.combustivel||'—')+'<br>' +
        U.esc(a.posto||'Posto não informado')+' · '+U.moeda(a.precoLitro)+'/L</small>' +
        '<span class="tag '+(cheio?'ok':'')+'">'+(cheio?'Tanque cheio':'Parcial')+'</span>' +
        (vg ? '<span class="tag roxo">'+U.esc(vg.titulo||vg.destino)+'</span>' : '') +
        '<div class="acoes-item">' +
        '<button onclick="App.formAbastecimento(null,\''+a.id+'\')"><span class="ms">edit</span> Editar</button>' +
        '<button onclick="App.remover(\'Abastecimentos\',\''+a.id+'\')"><span class="ms">delete</span></button>' +
        '</div></div></div>';
    }).join('') : UI.vazio('local_gas_station', vazioTxt));
  }
  render(todos,'listaAbastecimentos','Nenhum abastecimento lançado');
  render(deViagem,'listaAbastViagem','Nenhum abastecimento de viagem');
  render(rotina,'listaAbastRotina','Nenhum abastecimento do dia a dia');
};

App.formAbastecimento = function (veicId, id, viagemId) {
  if (!U.temVeiculo()) return;
  var a = id ? (DB.abastecimentos.filter(function(x){return x.id===id;})[0] || {}) : {};
  var vSel = a.veiculoId || veicId || (VEICULO_SEL!=='todos'?VEICULO_SEL:DB.veiculos[0].id);
  var v = U.veic(vSel) || {};
  var cheio = a.id ? String(a.tanqueCheio).toUpperCase()==='SIM' : true;
  var vgSel = a.id ? a.viagemId : (viagemId || '');
  var html = '<div class="form">' +
    UI.seletorVeiculo('fVeic', vSel, 'Qual veículo está abastecendo?') +
    '<div class="linha2">' +
      campo('Data','<input id="fData" type="date" value="'+(a.data||U.hoje())+'">') +
      campo('KM do painel','<input id="fKm" type="number" inputmode="numeric" value="'+(a.km||v.kmAtual||'')+'">') + '</div>' +
    '<div class="linha2">' +
      campo('Litros','<input id="fLitros" type="number" inputmode="decimal" step="0.01" value="'+(a.litros||'')+'" oninput="App.calcAbast()">') +
      campo('Preço/litro','<input id="fPreco" type="number" inputmode="decimal" step="0.001" value="'+(a.precoLitro||'')+'" oninput="App.calcAbast()">') + '</div>' +
    campo('Valor total (R$)','<input id="fTotal" type="number" inputmode="decimal" step="0.01" value="'+(a.valorTotal||'')+'" oninput="App.calcAbastInverso()">') +
    '<div class="linha2">' +
      campo('Combustível','<select id="fComb">'+['Gasolina','Etanol','Diesel S10','Diesel S500','GNV'].map(function (c) {
        return '<option'+((a.combustivel||v.combustivel)===c?' selected':'')+'>'+c+'</option>'; }).join('')+'</select>') +
      campo('Posto','<input id="fPosto" value="'+U.esc(a.posto)+'" placeholder="Nome/local">') + '</div>' +
    '<div class="switch"><span>Completou o tanque?</span><input type="checkbox" id="fCheio"'+(cheio?' checked':'')+'></div>' +
    '<div id="boxViagem">' + campo('Vincular à viagem','<select id="fViagem">'+UI.optViagens(vgSel, vSel)+'</select>') + '</div>' +
    campo('Observações','<textarea id="fObs">'+U.esc(a.obs)+'</textarea>') + '</div>';

  UI.modal(id?'Editar abastecimento':'Novo abastecimento', html, function () {
    if (UI.n('fKm') <= 0 || UI.n('fLitros') <= 0) return UI.toast('Informe KM e litros','erro');
    var reg = { id:id||'', veiculoId:UI.v('fVeic'), viagemId:UI.v('fViagem'), data:UI.v('fData'),
      km:UI.n('fKm'), litros:UI.n('fLitros'), precoLitro:UI.n('fPreco'),
      valorTotal: UI.n('fTotal') || Math.round(UI.n('fLitros')*UI.n('fPreco')*100)/100,
      posto:UI.v('fPosto'), combustivel:UI.v('fComb'),
      tanqueCheio: UI.chk('fCheio')?'SIM':'NAO', obs:UI.v('fObs') };
    UI.fecharModal(); UI.load(true,'Salvando…');
    Offline.salvarComFallback('Abastecimentos', reg, 'Abastecimento — ' + UI.n('fLitros') + ' L')
      .then(function(){ return App.aposSalvar('Abastecimento salvo'); })
      .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  });

  UI._aoTrocarVeic = function (novoId) {
    var nv = U.veic(novoId); if (!nv) return;
    var km = $('fKm');
    if (km && (!km.value || km.value == v.kmAtual)) km.value = nv.kmAtual || '';
    var cb = $('fComb');
    if (cb && nv.combustivel) {
      for (var i = 0; i < cb.options.length; i++)
        if (cb.options[i].value === nv.combustivel) { cb.selectedIndex = i; break; }
    }
    setHTML('boxViagem', campo('Vincular à viagem','<select id="fViagem">'+UI.optViagens('', novoId)+'</select>'));
    v = nv;
  };
};

App.calcAbast = function () {
  var l = UI.n('fLitros'), p = UI.n('fPreco');
  var t = $('fTotal');
  if (t && l>0 && p>0) t.value = (l*p).toFixed(2);
};
App.calcAbastInverso = function () {
  var t = UI.n('fTotal'), l = UI.n('fLitros'), p = UI.n('fPreco');
  if (t>0 && l>0) { var e=$('fPreco'); if(e) e.value = (t/l).toFixed(3); }
  else if (t>0 && p>0) { var e2=$('fLitros'); if(e2) e2.value = (t/p).toFixed(2); }
};

/* ==================== MANUTENCAO ==================== */

App.renderMonitor = function () {
  if (!temEl('listaMonitor')) return;
  var a = VEICULO_SEL==='todos' ? (DB.alertas||[]) : (DB.alertas||[]).filter(function(x){return x.veiculoId===VEICULO_SEL;});
  if (!a.length) {
    setHTML('listaMonitor', UI.vazio('event_repeat','Nenhum plano de revisão.<br>Crie na aba "Planos".'));
    return;
  }
  if (VEICULO_SEL === 'todos' && U.multi()) {
    var grupos = {}, ordem = [];
    a.forEach(function (x) {
      if (!grupos[x.veiculoId]) { grupos[x.veiculoId] = []; ordem.push(x.veiculoId); }
      grupos[x.veiculoId].push(x);
    });
    setHTML('listaMonitor', ordem.map(function (vid) {
      var v = U.veic(vid);
      var pend = grupos[vid].filter(function(x){ return x.status!=='ok'; }).length;
      return '<div class="grupo-veiculo" style="--c:'+(v?U.hex(v.cor):'#3b82f6')+'">' +
        '<div class="gv-cab"><span class="ms">'+(v?U.ico(v.tipo):'directions_car')+'</span>' +
        '<b>'+U.esc(v?v.nome:'Veículo')+'</b>' +
        '<span class="gv-info">'+(pend?pend+' pendente(s)':'tudo em dia')+'</span></div>' +
        grupos[vid].map(App.cardAlerta).join('') + '</div>';
    }).join(''));
  } else setHTML('listaMonitor', a.map(App.cardAlerta).join(''));
};

App.renderManutencoes = function () {
  if (!temEl('listaManutencoes')) return;
  var l = U.ordData(U.filtraVeic(DB.manutencoes));
  var total = 0; l.forEach(function (m) { total += Number(m.custo)||0; });
  var semLink = l.filter(function (m) { return !m.planoId; }).length;
  setHTML('resumoManut',
    '<div class="kpi x"><span class="ms">build</span><b>'+l.length+'</b><span class="lbl">Serviços</span></div>' +
    '<div class="kpi a"><span class="ms">payments</span><b>'+U.moeda(total)+'</b><span class="lbl">Total investido</span></div>');

  var avisoLink = semLink
    ? '<div class="aviso"><span class="ms">link_off</span><div><b>'+semLink+' serviço(s) sem vínculo</b>' +
      'Eles não zeram nenhuma revisão. Toque em <b>Vincular</b> no registro.</div></div>'
    : '';

  setHTML('listaManutencoes', avisoLink + (l.length ? l.map(function (m) {
    var cor = U.hexVeic(m.veiculoId);
    var pl = m.planoId ? U.plano(m.planoId) : null;
    return '<div class="item"><div class="av" style="background:'+cor+'22;color:'+cor+'">' +
      '<span class="ms">build</span></div>' +
      '<div class="txt"><b>'+U.esc(m.item)+'</b>' +
      (U.multi() && VEICULO_SEL==='todos' ? U.selo(m.veiculoId) : '') +
      '<small>'+U.data(m.data)+' · '+U.num(m.km)+' km · '+U.esc(m.tipo||'—') +
      (m.oficina?'<br>'+U.esc(m.oficina):'')+'</small>' +
      (pl ? '<span class="tag ok"><span class="ms" style="font-size:13px">link</span>'+U.esc(pl.item)+'</span>'
          : '<span class="tag atencao"><span class="ms" style="font-size:13px">link_off</span>sem revisão vinculada</span>') +
      (Number(m.garantiaMeses)>0 ? '<span class="tag azul">Garantia '+m.garantiaMeses+' meses</span>' : '') +
      '<div class="acoes-item">' +
      (pl ? '' : '<button onclick="App.vincular(\''+m.id+'\')"><span class="ms">link</span> Vincular</button>') +
      '<button onclick="App.formManutencao(null,\''+m.id+'\')"><span class="ms">edit</span> Editar</button>' +
      '<button onclick="App.remover(\'Manutencoes\',\''+m.id+'\')"><span class="ms">delete</span></button>' +
      '</div></div><div class="val"><b>'+U.moeda(m.custo)+'</b></div></div>';
  }).join('') : UI.vazio('build','Nenhuma manutenção registrada')));
};

App.vincular = function (manutencaoId) {
  var m = (DB.manutencoes||[]).filter(function (x) { return x.id === manutencaoId; })[0];
  if (!m) return;
  var html = '<div class="aviso info"><span class="ms">link</span><div><b>Ligar à revisão</b>' +
    'Escolha qual revisão do plano este serviço representa.</div></div>' +
    '<div class="form">' +
    '<div class="veic-unico" style="--c:'+U.hexVeic(m.veiculoId)+'">' +
    '<span class="ms">build</span><div><b>'+U.esc(m.item)+'</b>' +
    '<small>'+U.data(m.data)+' · '+U.num(m.km)+' km</small></div></div>' +
    campo('Revisão do plano','<select id="fPlanoLink">'+UI.optPlanos(m.veiculoId, '')+'</select>') + '</div>';
  UI.modal('Vincular serviço', html, function () {
    var pid = UI.v('fPlanoLink');
    if (!pid) return UI.toast('Escolha uma revisão','erro');
    UI.fecharModal(); UI.load(true,'Vinculando…');
    api('vincularManutencao', manutencaoId, pid)
      .then(function (r) { return App.aposSalvar('Vinculado a "'+r.item+'"'); })
      .catch(function (e) { UI.load(false); UI.toast(e.message,'erro'); });
  }, 'Vincular');
};

App.renderPlanos = function () {
  if (!temEl('listaPlanos')) return;
  var l = U.filtraVeic(DB.planos);
  if (!l.length) {
    setHTML('listaPlanos', UI.vazio('event_repeat','Nenhum plano.<br>Use <b>Plano padrão</b> acima.'));
    return;
  }
  function card(p) {
    var cor = U.hexVeic(p.veiculoId);
    return '<div class="item"><div class="av" style="background:'+cor+'22;color:'+cor+'">' +
      '<span class="ms">event_repeat</span></div>' +
      '<div class="txt"><b>'+U.esc(p.item)+'</b>' +
      '<small>A cada '+(Number(p.intervaloKm)?U.num(p.intervaloKm)+' km':'—') +
      (Number(p.intervaloMeses)?' ou '+p.intervaloMeses+' meses':'')+'<br>' +
      'Último: '+U.num(p.ultimoKm)+' km em '+U.data(p.ultimaData)+'</small>' +
      '<div class="acoes-item">' +
      '<button onclick="App.formPlano(\''+p.id+'\')"><span class="ms">edit</span> Editar</button>' +
      '<button onclick="App.remover(\'Planos\',\''+p.id+'\')"><span class="ms">delete</span></button>' +
      '</div></div></div>';
  }
  if (VEICULO_SEL === 'todos' && U.multi()) {
    var grupos = {}, ordem = [];
    l.forEach(function (p) {
      if (!grupos[p.veiculoId]) { grupos[p.veiculoId] = []; ordem.push(p.veiculoId); }
      grupos[p.veiculoId].push(p);
    });
    setHTML('listaPlanos', ordem.map(function (vid) {
      var v = U.veic(vid);
      return '<div class="grupo-veiculo" style="--c:'+(v?U.hex(v.cor):'#3b82f6')+'">' +
        '<div class="gv-cab"><span class="ms">'+(v?U.ico(v.tipo):'directions_car')+'</span>' +
        '<b>'+U.esc(v?v.nome:'Veículo')+'</b><span class="gv-info">'+grupos[vid].length+' item(ns)</span></div>' +
        grupos[vid].map(card).join('') + '</div>';
    }).join(''));
  } else setHTML('listaPlanos', l.map(card).join(''));
};

App.formManutencao = function (pre, id) {
  if (!U.temVeiculo()) return;
  var m = id ? (DB.manutencoes.filter(function(x){return x.id===id;})[0] || {}) : {};
  pre = pre || {};
  var vSel = m.veiculoId || pre.veiculoId || (VEICULO_SEL!=='todos'?VEICULO_SEL:DB.veiculos[0].id);
  var v = U.veic(vSel) || {};
  var planoSel = m.planoId || pre.planoId || '';
  var itemLivre = m.item || pre.item || '';

  var html = '<div class="form">' +
    UI.seletorVeiculo('fVeic', vSel, 'Qual veículo recebeu o serviço?') +
    '<div id="boxPlano">' +
      campo('Qual revisão foi feita?','<select id="fPlano" onchange="App.aoTrocarPlano()">' +
        UI.optPlanos(vSel, planoSel) + '</select>') +
    '</div>' +
    '<p class="dica" id="dicaPlano">Escolher a revisão da lista faz o alerta zerar automaticamente.</p>' +
    campo('Descrição do serviço','<input id="fItem" value="'+U.esc(itemLivre)+'" placeholder="Ex.: Troca de óleo 5W30">') +
    '<div class="linha2">' +
      campo('Data','<input id="fData" type="date" value="'+(m.data||U.hoje())+'">') +
      campo('KM','<input id="fKm" type="number" inputmode="numeric" value="'+(m.km||pre.km||v.kmAtual||'')+'">') + '</div>' +
    campo('Tipo','<select id="fTipo">'+['Preventiva','Corretiva','Revisão programada','Troca de peça','Pneus','Elétrica','Funilaria']
      .map(function(t){ return '<option'+(m.tipo===t?' selected':'')+'>'+t+'</option>'; }).join('')+'</select>') +
    '<div class="linha2">' +
      campo('Custo (R$)','<input id="fCusto" type="number" inputmode="decimal" step="0.01" value="'+(m.custo||'')+'">') +
      campo('Oficina','<input id="fOficina" value="'+U.esc(m.oficina)+'">') + '</div>' +
    '<div class="linha2">' +
      campo('Garantia (meses)','<input id="fGar" type="number" inputmode="numeric" value="'+(m.garantiaMeses||'')+'">') +
      campo('Nota fiscal','<input id="fNota" value="'+U.esc(m.nota)+'">') + '</div>' +
    campo('Observações','<textarea id="fObs">'+U.esc(m.obs)+'</textarea>') + '</div>';

  UI.modal(id?'Editar manutenção':'Lançar manutenção', html, function () {
    var pid = UI.v('fPlano');
    var desc = UI.v('fItem');
    if (!pid && !desc) return UI.toast('Escolha a revisão ou descreva o serviço','erro');
    if (pid && !desc) { var pl = U.plano(pid); desc = pl ? pl.item : desc; }
    var reg = { id:id||'', veiculoId:UI.v('fVeic'), planoId:pid, data:UI.v('fData'), km:UI.n('fKm'),
      tipo:UI.v('fTipo'), item:desc, custo:UI.n('fCusto'), oficina:UI.v('fOficina'),
      garantiaMeses:UI.n('fGar'), nota:UI.v('fNota'), obs:UI.v('fObs') };
    UI.fecharModal(); UI.load(true,'Salvando…');
    Offline.salvarComFallback('Manutencoes', reg, 'Manutenção — ' + UI.v('fItem')).then(function (r) {
      var msg = 'Manutenção registrada';
      var pa = r && r.planoAtualizado;
      if (pa && pa.semPlano) msg = 'Registrado como serviço avulso.';
      else if (pa && pa.item) msg = 'Registrado! O alerta de "' + pa.item + '" foi zerado.';
      return App.aposSalvar(msg);
    }).catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  });

  App.aoTrocarPlano();
  UI._aoTrocarVeic = function (novoId) {
    var nv = U.veic(novoId); if (!nv) return;
    var km = $('fKm');
    if (km && (!km.value || km.value == v.kmAtual)) km.value = nv.kmAtual || '';
    setHTML('boxPlano', campo('Qual revisão foi feita?',
      '<select id="fPlano" onchange="App.aoTrocarPlano()">'+UI.optPlanos(novoId, '')+'</select>'));
    v = nv;
    App.aoTrocarPlano();
  };
};

App.aoTrocarPlano = function () {
  var pid = UI.v('fPlano');
  var d = $('dicaPlano');
  var it = $('fItem');
  if (pid) {
    var pl = U.plano(pid);
    if (d) d.innerHTML = '<span class="ms" style="font-size:14px;color:#22c55e">check_circle</span> ' +
      'Ao salvar, o alerta de <b>'+U.esc(pl?pl.item:'')+'</b> será zerado.';
    if (it && !it.value && pl) it.value = pl.item;
  } else if (d) {
    d.textContent = 'Sem revisão vinculada — este serviço não vai zerar nenhum alerta.';
  }
};

App.formPlano = function (id) {
  if (!U.temVeiculo()) return;
  var p = id ? (DB.planos.filter(function(x){return x.id===id;})[0] || {}) : {};
  var vSel = p.veiculoId || (VEICULO_SEL!=='todos'?VEICULO_SEL:DB.veiculos[0].id);
  var v = U.veic(vSel) || {};
  var html = '<div class="form">' +
    UI.seletorVeiculo('fVeic', vSel, 'Plano para qual veículo?') +
    campo('Item da revisão','<input id="fItem" value="'+U.esc(p.item)+'" placeholder="Ex.: Troca de óleo">') +
    '<div class="linha2">' +
      campo('Intervalo (km)','<input id="fIntKm" type="number" inputmode="numeric" value="'+(p.intervaloKm||'')+'" placeholder="10000">') +
      campo('Intervalo (meses)','<input id="fIntMes" type="number" inputmode="numeric" value="'+(p.intervaloMeses||'')+'" placeholder="12">') + '</div>' +
    '<div class="linha2">' +
      campo('Último KM feito','<input id="fUltKm" type="number" inputmode="numeric" value="'+(p.ultimoKm||v.kmAtual||'')+'">') +
      campo('Última data','<input id="fUltData" type="date" value="'+(p.ultimaData||U.hoje())+'">') + '</div></div>';
  UI.modal(id?'Editar plano':'Novo plano', html, function () {
    if (!UI.v('fItem')) return UI.toast('Informe o item','erro');
    var reg = { id:id||'', veiculoId:UI.v('fVeic'), item:UI.v('fItem'),
      intervaloKm:UI.n('fIntKm'), intervaloMeses:UI.n('fIntMes'),
      ultimoKm:UI.n('fUltKm'), ultimaData:UI.v('fUltData'), ativo:'SIM' };
    UI.fecharModal(); UI.load(true,'Salvando…');
    api('salvar','Planos',reg)
      .then(function(){ return App.aposSalvar('Plano salvo'); })
      .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  });
  UI._aoTrocarVeic = function (novoId) {
    var nv = U.veic(novoId); if (!nv) return;
    var k = $('fUltKm');
    if (k && (!k.value || k.value == v.kmAtual)) k.value = nv.kmAtual || '';
    v = nv;
  };
};

App.gerarPlanoPadrao = function () {
  if (!U.temVeiculo()) return;
  if (VEICULO_SEL === 'todos' && U.multi()) {
    var html = '<div class="form"><div class="aviso info"><span class="ms">event_repeat</span>' +
      '<div><b>Plano de revisões</b>Escolha o veículo.</div></div>' +
      UI.seletorVeiculo('fVeic', DB.veiculos[0].id, 'Veículo') + '</div>';
    UI.modal('Escolher veículo', html, function () {
      var id = UI.v('fVeic'); UI.fecharModal();
      setTimeout(function(){ App.planoPadrao(id); }, 250);
    }, 'Continuar');
    return;
  }
  App.planoPadrao(U.veicAtual().id);
};

App.concluirRevisao = function (planoId) {
  var p = U.plano(planoId);
  if (!p) return;
  var v = U.veic(p.veiculoId);
  App.formManutencao({ veiculoId:p.veiculoId, planoId:planoId, item:p.item, km:v?v.kmAtual:'' });
};

/* ==================== PDF ==================== */

App.pdfManutencao = function (veicId) {
  if (!U.temVeiculo()) return;
  var vId = veicId || (VEICULO_SEL!=='todos' ? VEICULO_SEL : (DB.veiculos[0]||{}).id);
  var v = U.veic(vId);
  if (!v) return UI.toast('Selecione um veículo','erro');
  var html = '<div class="form"><div class="aviso info"><span class="ms">picture_as_pdf</span>' +
    '<div><b>Histórico de manutenções</b>PDF com serviços e próximas revisões.</div></div>' +
    UI.seletorVeiculo('fVeic', vId, 'Veículo do relatório') +
    '<div class="linha2">' + campo('De (opcional)','<input id="fDe" type="date">') +
      campo('Até (opcional)','<input id="fAte" type="date">') + '</div></div>';
  UI.modal('Exportar PDF', html, function () {
    var op = { veiculoId:UI.v('fVeic'), de:UI.v('fDe'), ate:UI.v('fAte') };
    UI.fecharModal(); UI.load(true,'Gerando PDF…');
    api('gerarRelatorioPDF', op).then(function (r) { UI.load(false); App.mostrarPDF(r); })
      .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  }, 'Gerar PDF');
};

App.pdfFrota = function () {
  UI.load(true,'Gerando comparativo…');
  api('gerarRelatorioFrotaPDF').then(function (r) { UI.load(false); App.mostrarPDF(r); })
    .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
};

App.pdfViagem = function () {
  if (!VIAGEM_ABERTA) return UI.toast('Abra uma viagem primeiro','erro');
  UI.load(true,'Gerando PDF da viagem…');
  api('gerarRelatorioViagemPDF', VIAGEM_ABERTA).then(function (r) { UI.load(false); App.mostrarPDF(r); })
    .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
};

App._pdf = null;

App.mostrarPDF = function (r) {
  if (!r || !r.base64) return UI.toast('Não foi possível gerar o PDF','erro');
  App._pdf = r;
  var extra = r.drive
    ? '<div class="acao-topo" style="margin:0"><a class="btn ghost bloco-full" href="'+r.url+'" target="_blank" rel="noopener" style="text-decoration:none">' +
      '<span class="ms">cloud_done</span> Abrir cópia no Drive</a></div>'
    : '<p class="dica" style="margin-top:10px">Gerado direto no seu aparelho.</p>';
  UI.modal('PDF pronto',
    '<div class="aviso verde"><span class="ms">check_circle</span><div><b>'+U.esc(r.nome)+'</b>' +
    'Documento gerado ('+r.tamanhoKb+' KB).</div></div>' +
    '<div class="acao-topo" style="margin:14px 0 0">' +
    '<button class="btn primario bloco-full" onclick="App.abrirPDF()"><span class="ms">visibility</span> Abrir e imprimir</button></div>' +
    '<div class="acao-topo" style="margin:0">' +
    '<button class="btn ghost bloco-full" onclick="App.baixarPDF()"><span class="ms">download</span> Salvar no aparelho</button></div>' + extra, null);
  UI.toast('PDF gerado','ok');
};

App._blobPDF = function () {
  var b = atob(App._pdf.base64);
  var arr = new Uint8Array(b.length);
  for (var i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i);
  return new Blob([arr], { type: 'application/pdf' });
};
App.abrirPDF = function () {
  if (!App._pdf) return;
  try {
    var url = URL.createObjectURL(App._blobPDF());
    if (!window.open(url, '_blank')) UI.toast('Bloqueado — use "Salvar"','erro');
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
  } catch (e) { UI.toast('Não foi possível abrir.','erro'); }
};
App.baixarPDF = function () {
  if (!App._pdf) return;
  try {
    var url = URL.createObjectURL(App._blobPDF());
    var a = document.createElement('a');
    a.href = url; a.download = App._pdf.nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 30000);
    UI.toast('Salvo em Downloads','ok');
  } catch (e) { UI.toast('Falha ao salvar','erro'); }
};

/* ===================== GEO ===================== */

var Geo = {
  timers: {}, ultimo: {}, fila: null,
  campo: function (id, label, placeholder, valor, extra) {
    return '<div class="campo-geo"><label>'+label+'</label>' +
      '<div class="geo-box"><input id="'+id+'" placeholder="'+placeholder+'" autocomplete="off" ' +
      'value="'+U.esc(valor||'')+'" oninput="Geo.digitou(\''+id+'\')" onfocus="Geo.digitou(\''+id+'\')">' +
      '<span class="geo-status" id="st'+id+'"><span class="ms">search</span></span></div>' +
      '<div class="sugestoes" id="sug'+id+'"></div>' + (extra || '') + '</div>';
  },
  estado: function (id, modo) {
    var el = $('st'+id); if (!el) return;
    if (modo === 'carregando') el.innerHTML = '<i class="mini-loader"></i>';
    else if (modo === 'ok') el.innerHTML = '<span class="ms verde">check_circle</span>';
    else if (modo === 'vazio') el.innerHTML = '<span class="ms amarelo">search_off</span>';
    else el.innerHTML = '<span class="ms">search</span>';
  },
  digitou: function (id) {
    var txt = UI.v(id), box = $('sug'+id);
    if (!box) return;
    if (txt.length < 3) { box.innerHTML=''; box.classList.remove('aberto'); Geo.estado(id,''); return; }
    if (Geo.ultimo[id] === txt) return;
    Geo.estado(id, 'carregando');
    box.innerHTML = '<div class="sug-carregando"><i class="mini-loader"></i> Procurando endereços…</div>';
    box.classList.add('aberto');
    clearTimeout(Geo.timers[id]);
    Geo.timers[id] = setTimeout(function () { Geo.buscar(id, txt); }, 550);
  },
  buscar: function (id, txt) {
    Geo.fila = (Geo.fila || Promise.resolve()).then(function () {
      if (UI.v(id) !== txt) return;
      Geo.ultimo[id] = txt;
      return comPrazo(api('sugerirLocais', txt), 15000, 'demorou').then(function (r) {
        var box = $('sug'+id);
        if (!box || UI.v(id) !== txt) return;
        r = r || [];
        if (!r.length || (r.length===1 && r[0].tipo==='erro')) {
          Geo.estado(id, 'vazio');
          box.innerHTML = '<div class="sug-vazio">' +
            (r.length ? U.esc(r[0].nome) : 'Nada encontrado. Inclua a cidade e o estado.') + '</div>';
          box.classList.add('aberto'); return;
        }
        Geo.estado(id, '');
        box.innerHTML = r.map(function (x) {
          var p = String(x.nome).split('—');
          return '<div onclick="Geo.escolher(\''+id+'\',this)" data-n="'+U.esc(x.nome)+'">' +
            '<span class="ms">'+Geo.ico(x.tipo)+'</span><div><b>'+U.esc(p[0].trim())+'</b>' +
            (p[1] ? '<small>'+U.esc(p.slice(1).join('—').trim())+'</small>' : '') + '</div></div>';
        }).join('');
        box.classList.add('aberto');
      }).catch(function () {
        var box = $('sug'+id);
        Geo.estado(id, 'vazio');
        if (box) box.innerHTML = '<div class="sug-vazio">Busca indisponível.</div>';
      });
    });
  },
  ico: function (t) {
    if (!t) return 'place';
    if (t==='city'||t==='town'||t==='municipality'||t==='village') return 'location_city';
    if (t==='street'||t==='residential'||t==='road') return 'signpost';
    if (t==='house'||t==='building') return 'home';
    return 'place';
  },
  escolher: function (id, el) {
    var nome = el.getAttribute('data-n');
    var inp = $(id); if (inp) inp.value = nome;
    Geo.ultimo[id] = nome;
    var box = $('sug'+id);
    if (box) { box.innerHTML=''; box.classList.remove('aberto'); }
    Geo.estado(id, 'ok');
  },
  limpar: function () { Geo.timers = {}; Geo.ultimo = {}; }
};

App.alertaManutViagem = function (veiculoId, distancia, dataInicio, dataFim, aoContinuar) {
  UI.load(true, 'Conferindo as revisões…');
  comPrazo(api('verificarManutencaoViagem', veiculoId, distancia, dataInicio, dataFim), 20000)
    .then(function (r) {
      UI.load(false);
      r = r || {};
      var venc = r.vencidos || [], cam = r.noCaminho || [], prazo = r.noPrazo || [];
      if (!venc.length && !cam.length && !prazo.length) { aoContinuar(); return; }
      var v = U.veic(veiculoId) || {};
      var grave = venc.length > 0;
      var cab = grave
        ? '<div class="aviso"><span class="ms">error</span><div><b>Revisão vencida</b>' +
          U.esc(v.nome)+' tem '+venc.length+' item(ns) vencido(s).</div></div>'
        : (cam.length
          ? '<div class="aviso"><span class="ms">schedule</span><div><b>Revisão vence na viagem</b>' +
            cam.length+' item(ns) chegam ao limite no trajeto.</div></div>'
          : '<div class="aviso info"><span class="ms">info</span><div><b>Fique de olho</b>' +
            prazo.length+' item(ns) ficam perto do limite.</div></div>');
      var km = '<div class="km-viagem"><div><b>'+U.num(r.kmAtual)+'</b><small>KM hoje</small></div>' +
        '<span class="ms">east</span><div><b>'+U.num(r.kmFinal)+'</b><small>KM ao voltar</small></div>' +
        '<span class="km-dist">+'+U.num(r.distancia,1)+' km</span></div>';
      function bloco(titulo, lista, cls, ico) {
        if (!lista.length) return '';
        return '<h4 class="hub-sec '+cls+'">'+titulo+'</h4><div class="lista-alerta">' +
          lista.map(function (x) {
            return '<div class="al-item '+cls+'"><span class="ms">'+ico+'</span>' +
              '<div><b>'+U.esc(x.item)+'</b><small>'+U.esc(x.motivoViagem || x.motivo)+'</small></div></div>';
          }).join('') + '</div>';
      }
      var html = cab + km +
        bloco('Já vencidos', venc, 'r', 'error') +
        bloco('Vencem durante a viagem', cam, 'a', 'schedule') +
        bloco('Ficam perto do limite', prazo, 'i', 'info') +
        '<p class="dica" style="margin-top:12px">É só um aviso — você pode continuar.</p>';
      UI.modal(grave ? 'Revisão vencida' : 'Revisão durante a viagem', html, function () {
        UI.fecharModal(); aoContinuar();
      }, grave ? 'Continuar mesmo assim' : 'Entendi, continuar');
    })
    .catch(function () { UI.load(false); aoContinuar(); });
};

/* ==================== VIAGENS ==================== */

App.renderViagens = function () {
  if (!temEl('listaViagens')) return;
  var l = U.filtraVeic(DB.viagens);
  var totalReal = 0;
  l.forEach(function (v) { totalReal += v.totalReal||0; });
  setHTML('resumoViagens',
    '<div class="kpi x"><span class="ms">luggage</span><b>'+l.length+'</b><span class="lbl">Viagens</span></div>' +
    '<div class="kpi v"><span class="ms">payments</span><b>'+U.moeda(totalReal)+'</b><span class="lbl">Gasto com viagens</span></div>');
  if (!l.length) {
    setHTML('listaViagens',
      '<div class="aviso info"><span class="ms">help</span><div><b>Como funcionam as viagens</b>' +
      'Uma viagem agrupa os gastos de um deslocamento.<br><br>' +
      '<b>Planejar:</b> escolha o veículo, origem e destino.<br>' +
      '<b>Manual:</b> para viagens já feitas.</div></div>' +
      '<div class="acao-topo"><button class="btn primario bloco-full" onclick="App.formViagemManual()">' +
      '<span class="ms">edit_note</span> Criar minha primeira viagem</button></div>');
    return;
  }
  setHTML('listaViagens', l.map(function (v) {
    var st = v.status==='concluida' ? 'ok' : (v.status==='andamento' ? 'atencao' : 'azul');
    var stTxt = v.status==='concluida' ? 'Concluída' : (v.status==='andamento' ? 'Em andamento' : 'Planejada');
    var desvio = '';
    if (v.totalPrev > 0 && v.totalReal > 0) {
      desvio = v.desvio > 0 ? '<span class="tag vencido">'+U.moeda(v.desvio)+' acima</span>'
                            : '<span class="tag ok">'+U.moeda(Math.abs(v.desvio))+' abaixo</span>';
    }
    var arq = (v.ativa !== 1) ? '<span class="tag">arquivada</span>' : '';
    var iv = v.idaVolta ? '<span class="tag azul"><span class="ms" style="font-size:13px">sync_alt</span>ida e volta</span>' : '';
    var mp = v.temRota ? '<span class="tag roxo"><span class="ms" style="font-size:13px">map</span>com rota</span>' : '';
    var vc = U.veic(v.veiculoId);
    var cor = vc?U.hex(vc.cor):'#22d3ee';
    return '<div class="item clicavel'+(v.ativa!==1?' antiga':'')+'" onclick="App.abrirViagem(\''+v.id+'\')">' +
      '<div class="av" style="background:'+cor+'22;color:'+cor+'">' +
      '<span class="ms">'+(vc?U.ico(vc.tipo):'luggage')+'</span></div>' +
      '<div class="txt"><b>'+U.esc(v.titulo || (v.origem+' → '+v.destino))+'</b>' +
      (U.multi() && VEICULO_SEL==='todos' ? U.selo(v.veiculoId) : '') +
      '<small>'+U.data(v.dataInicio)+(v.dataFim?' a '+U.data(v.dataFim):'')+' · '+U.num(v.kmReal||v.distancia,1)+' km<br>' +
      (v.qtdDespesas||0)+' despesa(s) · '+U.moeda(v.gastoCombustivel)+' em combustível</small>' +
      '<span class="tag '+st+'">'+stTxt+'</span>'+iv+mp+desvio+arq+'</div>' +
      '<div class="val"><b>'+U.moeda(v.totalReal)+'</b><small>'+(v.custoPorKm>0?U.moeda(v.custoPorKm)+'/km':'—')+'</small></div></div>';
  }).join(''));
};

App.abrirViagem = function (id, semNavegar) {
  var v = U.viagem(id);
  if (!v) { VIAGEM_ABERTA = null; return App.irPara('viagens'); }
  if (!temEl('cabecViagem')) return;
  VIAGEM_ABERTA = id;
  if (!semNavegar) App.irPara('viagem');

  var vc = U.veic(v.veiculoId);
  var st = v.status==='concluida' ? 'ok' : (v.status==='andamento' ? 'atencao' : 'azul');
  var stTxt = v.status==='concluida' ? 'Concluída' : (v.status==='andamento' ? 'Em andamento' : 'Planejada');

  setHTML('cabecViagem',
    '<div class="cab-viagem" style="--c:'+(vc?U.hex(vc.cor):'#3b82f6')+'">' +
    '<h3>'+U.esc(v.titulo || (v.origem+' → '+v.destino))+'</h3>' +
    '<div class="rota-txt"><span class="ms">trip_origin</span>'+U.esc(v.origem)+
    '<span class="ms">'+(v.idaVolta?'sync_alt':'east')+'</span>'+U.esc(v.destino)+'</div>' +
    '<div class="rota-txt" style="margin-top:5px"><span class="ms">event</span>'+U.data(v.dataInicio)+
    (v.dataFim?' a '+U.data(v.dataFim):'')+'</div>' +
    '<div class="rota-txt" style="margin-top:5px"><span class="ms">'+(vc?U.ico(vc.tipo):'directions_car')+'</span>' +
    U.esc(U.nomeVeic(v.veiculoId))+'</div>' +
    '<span class="tag '+st+'">'+stTxt+'</span>' +
    (v.idaVolta ? '<span class="tag azul">ida e volta</span>' : '') +
    '<div class="cab-nums">' +
    '<div><b>'+U.num(v.kmReal||v.distancia,1)+'</b><small>KM</small></div>' +
    '<div><b>'+U.num(v.litros,1)+' L</b><small>COMBUSTÍVEL</small></div>' +
    '<div><b>'+U.moeda(v.totalReal)+'</b><small>GASTO TOTAL</small></div></div>' +
    '<div class="acoes-item" style="margin-top:12px">' +
    (v.status!=='concluida' ? '<button onclick="App.encerrarViagem(\''+id+'\')"><span class="ms">flag</span> Encerrar</button>' : '') +
    '<button onclick="App.formViagemManual(\''+id+'\')"><span class="ms">edit</span> Editar</button>' +
    '<button onclick="App.formOrcamento(\''+id+'\')"><span class="ms">savings</span> Orçamento</button>' +
    '<button onclick="App.excluirViagem(\''+id+'\')"><span class="ms">delete</span> Excluir</button>' +
    '</div></div>');

  setHTML('atalhosViagem',
    '<button onclick="App.formAbastecimento(\''+v.veiculoId+'\',null,\''+id+'\')"><span class="ms">local_gas_station</span><small>Abastecer</small></button>' +
    '<button class="verde" onclick="App.formDespesa(null,\''+id+'\',\'Alimentação\')"><span class="ms">restaurant</span><small>Alimentação</small></button>' +
    '<button class="roxo" onclick="App.formDespesa(null,\''+id+'\',\'Hospedagem\')"><span class="ms">hotel</span><small>Estadia</small></button>' +
    '<button class="amarelo" onclick="App.formDespesa(null,\''+id+'\',\'Pedágio\')"><span class="ms">toll</span><small>Pedágio</small></button>');

  App.renderOrcado(v);

  var abs = DB.abastecimentos.filter(function (a) { return a.viagemId === id; }).map(function (a) {
    return { tipo:'ab', id:a.id, data:a.data, titulo:U.num(a.litros,2)+' L de '+(a.combustivel||'combustível'),
             sub:(a.posto||'Posto')+' · '+U.num(a.km)+' km',
             valor:Number(a.valorTotal)||0, ico:'local_gas_station', cor:'#3b82f6' };
  });
  var dsp = DB.despesas.filter(function (d) { return d.viagemId === id; }).map(function (d) {
    return { tipo:'de', id:d.id, data:d.data, titulo:d.descricao || d.categoria,
             sub:d.categoria + (d.local ? ' · '+d.local : ''),
             valor:Number(d.valor)||0, ico:U.icoCat(d.categoria), cor:U.corCat(d.categoria) };
  });
  var todos = abs.concat(dsp).sort(function (a,b) { return String(b.data).localeCompare(String(a.data)); });
  setHTML('listaLancamentos', todos.length ? todos.map(function (x) {
    return '<div class="item"><div class="av" style="background:'+x.cor+'22;color:'+x.cor+'">' +
      '<span class="ms">'+x.ico+'</span></div>' +
      '<div class="txt"><b>'+U.esc(x.titulo)+'</b><small>'+U.data(x.data)+' · '+U.esc(x.sub)+'</small>' +
      '<div class="acoes-item">' +
      (x.tipo==='de' ? '<button onclick="App.formDespesa(\''+x.id+'\')"><span class="ms">edit</span> Editar</button>'
                     : '<button onclick="App.formAbastecimento(null,\''+x.id+'\')"><span class="ms">edit</span> Editar</button>') +
      '<button onclick="App.remover(\''+(x.tipo==='ab'?'Abastecimentos':'Despesas')+'\',\''+x.id+'\')"><span class="ms">delete</span> Excluir</button>' +
      '</div></div><div class="val"><b>'+U.moeda(x.valor)+'</b></div></div>';
  }).join('') : UI.vazio('receipt_long','Nenhum lançamento.<br>Use os atalhos acima.'));

  Viagem.montarMapaViagem(v);
  App.renderParadas(id);
};

App.renderOrcado = function (v) {
  if (!temEl('orcadoReal')) return;
  var linhas = v.orcado || [];
  var totPrev = 0, totReal = 0;
  linhas.forEach(function (o) { totPrev += o.prev; totReal += o.real; });

  var comValor = linhas.filter(function (o) { return o.real > 0; });
  var barra = '';
  if (totReal > 0) {
    barra = '<div class="orc-pilha">' + comValor.map(function (o) {
      return '<i style="width:'+(o.real/totReal*100)+'%;background:'+o.cor+'" title="'+o.cat+'"></i>';
    }).join('') + '</div>';
  }

  var html = '<div class="orc">' + barra;

  linhas.forEach(function (o) {
    if (o.prev <= 0 && o.real <= 0) return;
    var pct = o.prev > 0 ? Math.min(100, (o.real/o.prev)*100) : (o.real > 0 ? 100 : 0);
    var estouro = (o.prev > 0 && o.real > o.prev);
    var dif = o.real - o.prev;
    html += '<div class="orc-cat" style="--cc:'+o.cor+'">' +
      '<div class="oc-topo">' +
        '<span class="oc-nome"><i class="oc-bola"></i>' +
        '<span class="ms">'+o.ico+'</span>'+o.cat+'</span>' +
        '<span class="oc-val"><b>'+U.moeda(o.real)+'</b>' +
        (o.prev > 0 ? '<small>de '+U.moeda(o.prev)+'</small>' : '<small>sem orçamento</small>') + '</span>' +
      '</div>' +
      '<div class="oc-barra"><i class="'+(estouro?'estouro':'')+'" style="width:'+pct+'%"></i></div>' +
      (o.prev > 0
        ? '<div class="oc-nota '+(dif>0?'ruim':'bom')+'">' +
          (dif > 0 ? U.moeda(dif) + ' acima do previsto' :
           (dif < 0 ? U.moeda(Math.abs(dif)) + ' de sobra' : 'exatamente no previsto')) + '</div>'
        : '') +
      '</div>';
  });

  if (v.detalheOutros && v.detalheOutros.length) {
    html += '<div class="oc-detalhe"><b>Dentro de "Outros":</b> ' +
      v.detalheOutros.map(function (x) {
        return '<span class="od-item"><i style="background:'+x.cor+'"></i>' +
          U.esc(x.cat)+' '+U.moeda(x.valor)+'</span>';
      }).join('') + '</div>';
  }

  var difT = totReal - totPrev;
  html += '<div class="orc-total">' +
    '<div class="ot-lin"><span>Previsto</span><b>'+U.moeda(totPrev)+'</b></div>' +
    '<div class="ot-lin"><span>Realizado</span><b>'+U.moeda(totReal)+'</b></div>' +
    (totPrev > 0
      ? '<div class="ot-lin destaque '+(difT>0?'ruim':'bom')+'"><span>' +
        (difT > 0 ? 'Estourou' : 'Economizou') + '</span><b>'+U.moeda(Math.abs(difT))+'</b></div>'
      : '<div class="ot-lin"><span style="font-size:11px">Defina o orçamento para comparar</span>' +
        '<button class="link-btn" style="padding:0" onclick="App.formOrcamento(\''+v.id+'\')">definir</button></div>') +
    '</div></div>';

  setHTML('orcadoReal', html);
};

App.formOrcamento = function (id) {
  var v = U.viagem(id);
  if (!v) return;
  var html = '<div class="aviso info"><span class="ms">savings</span><div><b>Orçamento da viagem</b>' +
    'Informe quanto espera gastar em cada categoria.</div></div>' +
    '<div class="form">' +
    campo('<i class="oc-bola" style="--cc:'+U.corCat('Combustível')+'"></i> Combustível',
      '<input id="oComb" type="number" step="0.01" value="'+(v.combustivelPrev||'')+'" oninput="App.somarOrc()">') +
    campo('<i class="oc-bola" style="--cc:'+U.corCat('Alimentação')+'"></i> Alimentação',
      '<input id="oAlim" type="number" step="0.01" value="'+(v.alimentacaoPrev||'')+'" oninput="App.somarOrc()">') +
    campo('<i class="oc-bola" style="--cc:'+U.corCat('Hospedagem')+'"></i> Hospedagem',
      '<input id="oHosp" type="number" step="0.01" value="'+(v.hospedagemPrev||'')+'" oninput="App.somarOrc()">') +
    campo('<i class="oc-bola" style="--cc:'+U.corCat('Pedágio')+'"></i> Pedágio',
      '<input id="oPed" type="number" step="0.01" value="'+(v.pedagioPrev||'')+'" oninput="App.somarOrc()">') +
    campo('<i class="oc-bola" style="--cc:'+U.corCat('Outros')+'"></i> Outros',
      '<input id="oOut" type="number" step="0.01" value="'+(v.outrosPrev||'')+'" oninput="App.somarOrc()">') +
    '<div class="orc-soma"><span>Total previsto</span><b id="orcSoma">'+U.moeda(v.totalPrev)+'</b></div>' +
    '</div>';
  UI.modal('Orçamento da viagem', html, function () {
    var t = UI.n('oComb')+UI.n('oAlim')+UI.n('oHosp')+UI.n('oPed')+UI.n('oOut');
    var reg = { id:id, combustivelPrev:UI.n('oComb'), alimentacaoPrev:UI.n('oAlim'),
      hospedagemPrev:UI.n('oHosp'), pedagioPrev:UI.n('oPed'), outrosPrev:UI.n('oOut'),
      totalPrev:Math.round(t*100)/100 };
    UI.fecharModal(); UI.load(true,'Salvando orçamento…');
    api('salvar','Viagens',reg)
      .then(function(){ return App.aposSalvar('Orçamento salvo'); })
      .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  }, 'Salvar orçamento');
};

App.somarOrc = function () {
  var t = UI.n('oComb')+UI.n('oAlim')+UI.n('oHosp')+UI.n('oPed')+UI.n('oOut');
  setTexto('orcSoma', U.moeda(t));
};

App.formDespesa = function (id, viagemId, catPre) {
  if (!U.temVeiculo()) return;
  var d = id ? (DB.despesas.filter(function(x){return x.id===id;})[0] || {}) : {};
  var vg = viagemId ? U.viagem(viagemId) : null;
  var vSel = d.veiculoId || (vg ? vg.veiculoId : (VEICULO_SEL!=='todos'?VEICULO_SEL:DB.veiculos[0].id));
  var catSel = d.categoria || catPre || 'Alimentação';
  var vgSel = d.id ? d.viagemId : (viagemId || '');
  var chips = (DB.categorias||[]).map(function (c) {
    return '<div class="chip'+(c===catSel?' sel':'')+'" data-cat="'+U.esc(c)+'" ' +
      'style="--cc:'+U.corCat(c)+'" onclick="App.selCat(this)">' +
      '<span class="ms">'+U.icoCat(c)+'</span>'+c+'</div>';
  }).join('');
  var html = '<div class="form">' +
    UI.seletorVeiculo('fVeic', vSel, 'Despesa de qual veículo?') +
    '<div><label>Categoria</label><div class="chips" id="chipsCat">'+chips+'</div>' +
    '<input type="hidden" id="fCat" value="'+U.esc(catSel)+'"></div>' +
    campo('Valor (R$)','<input id="fValor" type="number" inputmode="decimal" step="0.01" value="'+(d.valor||'')+'" placeholder="0,00">') +
    '<div class="linha2">' +
      campo('Data','<input id="fData" type="date" value="'+(d.data||U.hoje())+'">') +
      campo('Local','<input id="fLocal" value="'+U.esc(d.local)+'" placeholder="Cidade / local">') + '</div>' +
    campo('Descrição','<input id="fDesc" value="'+U.esc(d.descricao)+'" placeholder="Ex.: almoço na rodovia">') +
    '<div id="boxViagem">' + campo('Vincular à viagem','<select id="fViagem">'+UI.optViagens(vgSel, vSel)+'</select>') + '</div>' +
    campo('Observações','<textarea id="fObs">'+U.esc(d.obs)+'</textarea>') + '</div>';
  UI.modal(id ? 'Editar despesa' : 'Nova despesa', html, function () {
    if (UI.n('fValor') <= 0) return UI.toast('Informe o valor','erro');
    var reg = { id:id||'', viagemId:UI.v('fViagem'), veiculoId:UI.v('fVeic'), data:UI.v('fData'),
      categoria:UI.v('fCat'), descricao:UI.v('fDesc'), valor:UI.n('fValor'), local:UI.v('fLocal'), obs:UI.v('fObs') };
    UI.fecharModal(); UI.load(true,'Salvando despesa…');
    Offline.salvarComFallback('Despesas', reg, 'Despesa — R$ ' + UI.n('fValor'))
      .then(function(){ return App.aposSalvar('Despesa registrada'); })
      .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  });
  UI._aoTrocarVeic = function (novoId) {
    setHTML('boxViagem', campo('Vincular à viagem','<select id="fViagem">'+UI.optViagens('', novoId)+'</select>'));
  };
};

App.selCat = function (el) {
  [].forEach.call(document.querySelectorAll('#chipsCat .chip'), function(c){ c.classList.remove('sel'); });
  el.classList.add('sel');
  var f = $('fCat'); if (f) f.value = el.getAttribute('data-cat');
};

App.formViagemManual = function (id) {
  if (!U.temVeiculo()) return;
  Geo.limpar();
  var v = id ? (U.viagem(id) || {}) : {};
  var vSel = v.veiculoId || (VEICULO_SEL!=='todos'?VEICULO_SEL:DB.veiculos[0].id);
  var veic = U.veic(vSel) || {};
  var novo = !id;
  var html = '<div class="form">' +
    UI.seletorVeiculo('fVeic', vSel, 'Qual veículo você usou?') +
    campo('Título da viagem','<input id="fTitulo" value="'+U.esc(v.titulo)+'" placeholder="Ex.: Visita à obra">') +
    Geo.campo('fOrig','Saí de','Cidade, endereço ou CEP', v.origem) +
    Geo.campo('fDest','Fui para','Cidade, endereço ou CEP', v.destino) +
    '<div class="switch"><span>Foi ida e volta?</span>' +
    '<input type="checkbox" id="fIdaVolta"'+(v.idaVolta?' checked':'')+'></div>' +
    '<div class="linha2">' +
      campo('Data de saída','<input id="fIni" type="date" value="'+(v.dataInicio||U.hoje())+'">') +
      campo('Data de volta','<input id="fFim" type="date" value="'+(v.dataFim||'')+'">') + '</div>' +
    '<div class="calc-km"><div class="linha2">' +
      campo('KM ao sair','<input id="fKmI" type="number" inputmode="numeric" value="'+(v.kmInicial||veic.kmAtual||'')+'" oninput="App.calcDistViagem()">') +
      campo('KM ao voltar','<input id="fKmF" type="number" inputmode="numeric" value="'+(v.kmFinal||'')+'" oninput="App.calcDistViagem()">') + '</div>' +
      '<div class="resultado-km" id="boxDist"><span class="ms">straighten</span>' +
      '<div><b id="distTxt">'+(v.distancia ? U.num(v.distancia,1)+' km' : '—')+'</b>' +
      '<small id="distNota">Distância calculada automaticamente</small></div></div>' +
'<input type="hidden" id="fDist" value="'+(v.distancia||'')+'">' +
'<div id="boxDistManual" class="oculto" style="margin-top:9px">' +
  campo('Distância manual (km)','<input id="fDistManualInput" type="number" inputmode="decimal" step="0.1" placeholder="Ex.: 320">') +
  '<button type="button" class="link-btn" onclick="App.confirmarDistManual()">' +
  '<span class="ms">check</span> Usar esta distância</button>' +
'</div>' +
'<button type="button" class="link-btn" id="btnDistManual" onclick="App.abrirDistManual()">' +
'<span class="ms">edit</span> Informar a distância manualmente</button></div>' +

    campo('Situação','<select id="fStatus">' +
      ['planejada','andamento','concluida'].map(function (s) {
        var t = s==='planejada'?'Planejada':(s==='andamento'?'Em andamento':'Concluída');
        return '<option value="'+s+'"'+((v.status||'andamento')===s?' selected':'')+'>'+t+'</option>';
      }).join('') + '</select>') +
    campo('Observações','<textarea id="fObs">'+U.esc(v.obs)+'</textarea>') + '</div>';

  UI.modal(id?'Editar viagem':'Registrar viagem', html, function () {
    if (!UI.v('fOrig') || !UI.v('fDest')) return UI.toast('Informe origem e destino','erro');
    var ki = UI.n('fKmI'), kf = UI.n('fKmF');
    if (kf > 0 && ki > 0 && kf < ki) return UI.toast('KM de volta menor que o de saída','erro');
    var dist = (kf > ki && ki > 0) ? (kf - ki) : UI.n('fDist');
    var reg = { id:id||'', veiculoId:UI.v('fVeic'),
      titulo:UI.v('fTitulo') || (UI.v('fOrig')+' → '+UI.v('fDest')),
      dataInicio:UI.v('fIni'), dataFim:UI.v('fFim'), origem:UI.v('fOrig'), destino:UI.v('fDest'),
      distancia: dist, kmInicial:ki, kmFinal:kf,
      idaVolta: UI.chk('fIdaVolta') ? 'SIM' : 'NAO',
      status:UI.v('fStatus'), obs:UI.v('fObs') };
    function gravar() {
      UI.load(true,'Salvando viagem…');
      api('salvar','Viagens',reg).then(function (r) {
        var nova = r.registro;
        return App.aposSalvar(id?'Viagem atualizada':'Viagem criada!', function () {
          if (!id && nova && nova.id) App.abrirViagem(nova.id);
        });
      }).catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
    }
    UI.fecharModal();
    if (novo || reg.status !== 'concluida') App.alertaManutViagem(reg.veiculoId, dist, reg.dataInicio, reg.dataFim, gravar);
    else gravar();
  }, novo ? 'Criar viagem' : 'Salvar');

  UI._aoTrocarVeic = function (novoId) {
    var nv = U.veic(novoId); if (!nv) return;
    var k = $('fKmI');
    if (k && (!k.value || k.value == veic.kmAtual)) { k.value = nv.kmAtual || ''; App.calcDistViagem(); }
    veic = nv;
  };
  setTimeout(App.calcDistViagem, 60);
};

App.calcDistViagem = function () {
  var ki = UI.n('fKmI'), kf = UI.n('fKmF');
  var txt = $('distTxt'), nota = $('distNota'), box = $('boxDist'), hid = $('fDist');
  if (!txt || !box || !hid) return;
  if (ki > 0 && kf > 0 && kf > ki) {
    var d = kf - ki;
    txt.textContent = U.num(d,1) + ' km';
    if (nota) nota.textContent = U.num(kf)+' − '+U.num(ki)+' = '+U.num(d,1)+' km percorridos';
    box.className = 'resultado-km ok'; hid.value = d;
  } else if (ki > 0 && kf > 0 && kf < ki) {
    txt.textContent = 'KM inválido';
    if (nota) nota.textContent = 'O KM de volta precisa ser maior';
    box.className = 'resultado-km erro'; hid.value = '';
  } else if (Number(hid.value) > 0 && !(kf > 0)) {
    txt.textContent = U.num(hid.value,1) + ' km';
    if (nota) nota.textContent = 'Distância informada manualmente';
    box.className = 'resultado-km ok';
  } else {
    txt.textContent = '—';
    if (nota) nota.textContent = ki > 0 ? 'Informe o KM de volta' : 'Informe o KM de saída e de volta';
    box.className = 'resultado-km'; hid.value = '';
  }
};

App.abrirDistManual = function () {
  var box = $('boxDistManual');
  var btn = $('btnDistManual');
  if (!box) return;

  box.classList.remove('oculto');
  if (btn) btn.classList.add('oculto');

  var atual = UI.v('fDist');
  var input = $('fDistManualInput');
  if (input) {
    if (atual) input.value = atual;
    input.focus();
  }
};

App.confirmarDistManual = function () {
  var n = UI.n('fDistManualInput');
  var hid = $('fDist');
  if (!hid) return;

  if (n <= 0) {
    UI.toast('Informe uma distância válida','erro');
    return;
  }

  hid.value = n;
  var kf = $('fKmF'); if (kf) kf.value = '';
  App.calcDistViagem();

  var box = $('boxDistManual');
  var btn = $('btnDistManual');
  if (box) box.classList.add('oculto');
  if (btn) btn.classList.remove('oculto');

  UI.toast('Distância definida: ' + U.num(n,1) + ' km','ok');
};

App.encerrarViagem = function (id) {
  var v = U.viagem(id); if (!v) return;
  var html = '<div class="aviso info"><span class="ms">flag</span><div><b>Encerrar a viagem</b>' +
    'Informe o KM que está no painel agora.</div></div><div class="form">' +
    campo('KM ao voltar','<input id="fKmF" type="number" inputmode="numeric" value="'+(v.kmFinal||'')+'" ' +
      'placeholder="saiu com '+U.num(v.kmInicial)+'" oninput="App.calcEncerrar('+(v.kmInicial||0)+')">') +
    '<div class="resultado-km" id="boxEnc"><span class="ms">straighten</span>' +
    '<div><b id="encTxt">—</b><small id="encNota">Distância calculada automaticamente</small></div></div>' +
    campo('Data de retorno','<input id="fFim" type="date" value="'+(v.dataFim||U.hoje())+'">') + '</div>';
  UI.modal('Encerrar viagem', html, function () {
    var kf = UI.n('fKmF');
    if (kf > 0 && v.kmInicial > 0 && kf < v.kmInicial)
      return UI.toast('KM final não pode ser menor que '+U.num(v.kmInicial),'erro');
    UI.fecharModal(); UI.load(true,'Encerrando…');
    var reg = { id:id, kmFinal:kf, dataFim:UI.v('fFim'), status:'concluida' };
    if (kf > v.kmInicial) reg.distancia = kf - v.kmInicial;
    api('salvar','Viagens',reg)
      .then(function(){ return App.aposSalvar('Viagem concluída'); })
      .catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  }, 'Encerrar');
};

App.calcEncerrar = function (kmIni) {
  var kf = UI.n('fKmF');
  var txt = $('encTxt'), nota = $('encNota'), box = $('boxEnc');
  if (!txt || !box) return;
  if (kf > kmIni && kmIni > 0) {
    txt.textContent = U.num(kf-kmIni,1)+' km';
    if (nota) nota.textContent = U.num(kf)+' − '+U.num(kmIni)+' = distância da viagem';
    box.className = 'resultado-km ok';
  } else if (kf > 0 && kf <= kmIni) {
    txt.textContent = 'KM inválido';
    if (nota) nota.textContent = 'Precisa ser maior que '+U.num(kmIni);
    box.className = 'resultado-km erro';
  } else {
    txt.textContent = '—';
    if (nota) nota.textContent = 'Distância calculada automaticamente';
    box.className = 'resultado-km';
  }
};

App.excluirViagem = function (id) {
  var v = U.viagem(id);
  if (!v) return;

  var html = '<div class="aviso"><span class="ms">warning</span><div><b>Excluir esta viagem?</b>' +
    'Todas as despesas vinculadas a "' + U.esc(v.titulo || v.destino) + '" também serão apagadas. ' +
    'Esta ação não pode ser desfeita.</div></div>';

  UI.modal('Excluir viagem', html, function () {
    UI.fecharModal();
    UI.load(true,'Excluindo…');
    api('excluirViagem', id).then(function () {
      VIAGEM_ABERTA = null;
      return App.aposSalvar('Viagem excluída', function () { App.irPara('viagens'); });
    }).catch(function(e){ UI.load(false); UI.toast(e.message,'erro'); });
  }, 'Excluir viagem');
};

/* ==================== PARADAS REALIZADAS ==================== */

App._paradas = [];
App._paradaAtual = '';
App._paradasAbertas = {};

App.renderParadas = function (viagemId) {
  if (!temEl('blocoParadas')) return;

  var bloco = $('blocoParadas');

  api('listarParadasViagem', viagemId).then(function (d) {
    if (!d || !d.paradas || !d.paradas.length) {
      bloco.classList.add('oculto');
      return;
    }

    bloco.classList.remove('oculto');
    App._paradas = d.paradas;

    var r = d.resumo;

    var barra = '<div class="pr-progresso">' +
      '<div class="pr-barra"><i style="width:'+r.percentualConcluido+'%"></i></div>' +
      '<span>'+r.concluidas+' de '+r.total+' concluída(s)</span></div>';

var resumo = '<div class="hub-resumo" style="margin-bottom:12px">' +
  '<div class="hr-item"><b>'+U.moeda(r.totalPrevisto)+'</b><small>previsto</small></div>' +
  '<div class="hr-item"><b>'+U.moeda(r.totalReal)+'</b><small>realizado</small></div>' +
  (r.concluidas > 0
    ? '<div class="hr-item '+(r.diferenca > 0.01 ? 'v' : (r.diferenca < -0.01 ? 'r' : ''))+'"><b>' +
      (r.diferenca > 0.01 ? '+' : (r.diferenca < -0.01 ? '−' : '')) + U.moeda(Math.abs(r.diferenca)) + '</b><small>' +
      (r.diferenca > 0.01 ? 'economia parcial' : (r.diferenca < -0.01 ? 'acima do previsto' : 'no previsto')) + '</small></div>'
    : '<div class="hr-item"><b>'+r.pendentes+'</b><small>pendentes</small></div>') +
  '</div>';

    var lista = d.paradas.map(function (p) {
      var st = String(p.status).toUpperCase();
      var concluida = (st === 'CONCLUIDA');
      var ignorada = (st === 'IGNORADA');
      var finalizada = concluida || ignorada;

      var aberta = finalizada ? (App._paradasAbertas[p.id] === true) : true;

      var cor = concluida ? '#22c55e' : (ignorada ? '#94a3b8' : '#3b82f6');
      var ico = concluida ? 'check_circle' : (ignorada ? 'block' : 'local_gas_station');

      var compacto = '';

if (finalizada && !aberta) {
  var dif = Number(p.diferenca) || 0;

  compacto =
    '<div class="pr-mini">' +
      (
        concluida
          ? U.num(p.litrosReal, 1) +
            ' L · ' +
            U.moeda(p.valorReal) +
            (
              Math.abs(dif) >= 0.01
                ? '<span class="pr-dif ' +
                  (dif > 0 ? 'bom' : 'ruim') +
                  '">' +
                  (dif > 0 ? '+' : '−') +
                  U.moeda(Math.abs(dif)) +
                  '</span>'
                : ''
            )
          : 'Não abasteceu · ' +
            U.moeda(p.valorPrevisto) +
            ' não gastos'
      ) +
    '</div>';
}

var comparativo = '';
if (aberta) {
  if (concluida) {
    var d2 = Number(p.diferenca) || 0;
    comparativo =
      '<div class="pr-comp">' +
        '<div class="pr-lin"><span>Previsto</span><b>' +
          U.num(p.litrosPrevisto,1)+' L · '+U.moeda(p.valorPrevisto)+'</b></div>' +
        '<div class="pr-lin"><span>Realizado</span><b>' +
          U.num(p.litrosReal,1)+' L · '+U.moeda(p.valorReal)+'</b></div>' +
        (Math.abs(d2) >= 0.01
          ? '<div class="pr-lin destaque '+(d2 > 0 ? 'bom' : 'ruim')+'"><span>' +
            (d2 > 0 ? 'Economizou' : 'Gastou a mais') + '</span><b>' +
            (d2 > 0 ? '+' : '−') + U.moeda(Math.abs(d2)) + '</b></div>'
          : '<div class="pr-lin"><span>Exatamente no previsto</span><b>—</b></div>') +
      '</div>';
  } else if (ignorada) {
    comparativo = '<div class="pr-comp"><div class="pr-lin">' +
      '<span>Parada ignorada</span><b>' + U.moeda(p.valorPrevisto) + ' não gastos</b></div></div>';
  } else {
    comparativo = '<div class="pr-comp"><div class="pr-lin">' +
      '<span>A abastecer</span><b>' + U.num(p.litrosPrevisto,1) + ' L · ' +
      U.moeda(p.valorPrevisto) + '</b></div></div>';
  }
}

      var acoes = '';

      if (aberta) {
        acoes = '<div class="acoes-item">' +
          (concluida || ignorada
            ? '<button onclick="App.reabrirParada(\''+p.id+'\')">' +
              '<span class="ms">undo</span> ' + (concluida ? 'Desfazer' : 'Reativar') + '</button>'
            : '<button class="pri" onclick="App.formConcluirParada(\''+p.id+'\')">' +
              '<span class="ms">local_gas_station</span> Abasteci aqui</button>' +
              '<button onclick="App.vincularAbastParada(\''+p.id+'\')">' +
              '<span class="ms">link</span> Já lancei</button>' +
              '<button onclick="App.ignorarParada(\''+p.id+'\')">' +
              '<span class="ms">block</span> Não parei</button>') +
          '</div>';
      }

      var navegar = (p.latitude && p.longitude && !finalizada)
        ? '<a class="pr-nav" href="'+URL_MAPS_DIR+p.latitude+','+p.longitude+'" target="_blank" rel="noopener">' +
          '<span class="ms">navigation</span></a>'
        : '';

      var seta = finalizada
        ? '<span class="ms pr-seta'+(aberta?' girada':'')+'">expand_more</span>'
        : '';

      var clique = finalizada
        ? ' onclick="App.alternarParada(\''+p.id+'\')" style="cursor:pointer"'
        : '';

      return '<div class="pr-item'+(concluida?' ok':'')+(ignorada?' off':'')+
        (finalizada && !aberta ? ' recolhido' : '')+'" style="--c:'+cor+'">' +
        '<div class="pr-cab"'+clique+'>' +
          '<div class="pr-num"><span class="ms">'+ico+'</span></div>' +
          '<div class="pr-txt">' +
            '<b>'+U.esc(p.postoNome || ('Parada ' + p.ordem))+'</b>' +
            '<small>Parada '+p.ordem+' · km '+U.num(p.kmPrevisto,1)+'</small>' +
            (aberta && p.postoEndereco ? '<small>'+U.esc(p.postoEndereco)+'</small>' : '') +
            (aberta && p.abastecimentoData ? '<small>Abastecido em '+U.data(p.abastecimentoData)+'</small>' : '') +
            compacto +
          '</div>' +
          navegar + seta +
        '</div>' +
        comparativo +
        acoes +
        '</div>';
    }).join('');

    var todasFeitas = (r.pendentes === 0);

    var rodape = todasFeitas
      ? '<div class="aviso verde" style="margin-top:4px">' +
        '<span class="ms">check_circle</span><div><b>Todas as paradas registradas</b>' +
        (r.diferenca > 0.01
  ? 'Você economizou ' + U.moeda(r.diferenca) + ' em relação ao previsto.'
  : (r.diferenca < -0.01
    ? 'Gastou ' + U.moeda(Math.abs(r.diferenca)) + ' acima do previsto.'
    : 'O gasto ficou exatamente no previsto.')) +
        '</div></div>'
      : '';

    setHTML('listaParadas', barra + resumo + lista + rodape);

  }).catch(function (e) {
    bloco.classList.add('oculto');
  });
};

App.alternarParada = function (paradaId) {
  App._paradasAbertas[paradaId] = !App._paradasAbertas[paradaId];
  if (VIAGEM_ABERTA) App.renderParadas(VIAGEM_ABERTA);
};

App.formConcluirParada = function (paradaId) {
  var p = null;
  for (var i = 0; i < App._paradas.length; i++) {
    if (App._paradas[i].id === paradaId) { p = App._paradas[i]; break; }
  }
  if (!p) return UI.toast('Parada não encontrada','erro');

  App._paradaAtual = paradaId;

  var v = U.veic(p.veiculoId) || {};

  var html = '<div class="aviso info"><span class="ms">local_gas_station</span><div>' +
    '<b>'+U.esc(p.postoNome || ('Parada ' + p.ordem))+'</b>' +
    'Previsto: '+U.num(p.litrosPrevisto,1)+' L · '+U.moeda(p.valorPrevisto)+
    '</div></div>' +
    '<div class="form">' +
    '<div class="linha2">' +
      campo('Data','<input id="cpData" type="date" value="'+U.hoje()+'">') +
      campo('KM do painel','<input id="cpKm" type="number" inputmode="numeric" value="'+(v.kmAtual||'')+'">') +
    '</div>' +
    '<div class="linha2">' +
      campo('Litros','<input id="cpLitros" type="number" inputmode="decimal" step="0.01" ' +
        'value="'+(p.litrosPrevisto||'')+'" oninput="App.calcParada()">') +
      campo('Preço/litro','<input id="cpPreco" type="number" inputmode="decimal" step="0.001" ' +
        'value="'+(p.precoLitroPrevisto||'')+'" oninput="App.calcParada()">') +
    '</div>' +
    campo('Valor total (R$)','<input id="cpTotal" type="number" inputmode="decimal" step="0.01" ' +
      'value="'+(p.valorPrevisto||'')+'" oninput="App.calcParadaInverso()">') +
    '<div class="pr-previa" id="cpPrevia"></div>' +
    '<div class="linha2">' +
      campo('Combustível','<select id="cpComb">' +
        ['Gasolina','Etanol','Diesel S10','Diesel S500','GNV'].map(function (c) {
          return '<option'+(v.combustivel===c?' selected':'')+'>'+c+'</option>';
        }).join('') + '</select>') +
      campo('Posto','<input id="cpPosto" value="'+U.esc(p.postoNome||'')+'">') +
    '</div>' +
    '<div class="switch"><span>Completou o tanque?</span>' +
    '<input type="checkbox" id="cpCheio" checked></div>' +
    campo('Observações','<textarea id="cpObs"></textarea>') +
    '</div>';

  UI.modal('Registrar abastecimento', html, function () {
    var litros = UI.n('cpLitros');
    if (litros <= 0) return UI.toast('Informe os litros','erro');

    var dados = {
      data: UI.v('cpData'),
      km: UI.n('cpKm'),
      litros: litros,
      precoLitro: UI.n('cpPreco'),
      valorTotal: UI.n('cpTotal'),
      posto: UI.v('cpPosto'),
      combustivel: UI.v('cpComb'),
      tanqueCheio: UI.chk('cpCheio'),
      obs: UI.v('cpObs')
    };

    UI.fecharModal();
    UI.load(true,'Registrando abastecimento…');

    api('concluirParada', paradaId, dados).then(function (r) {
      var msg = 'Parada ' + r.ordem + ' concluída';
if (r.diferenca > 0.01) {
  msg +=
    ' · economizou ' +
    U.moeda(r.diferenca);
} else if (r.diferenca < -0.01) {
  msg +=
    ' · ' +
    U.moeda(Math.abs(r.diferenca)) +
    ' acima do previsto';
}
      return App.aposSalvar(msg);
    }).catch(function (e) {
      UI.load(false); UI.toast(e.message,'erro');
    });
  }, 'Registrar');

  setTimeout(App.calcParada, 60);
};

App.calcParada = function () {
  var l = UI.n('cpLitros'), p = UI.n('cpPreco');
  var t = $('cpTotal');
  if (t && l > 0 && p > 0) t.value = (l * p).toFixed(2);
  App.previaParada();
};

App.calcParadaInverso = function () {
  var t = UI.n('cpTotal'), l = UI.n('cpLitros'), p = UI.n('cpPreco');
  if (t > 0 && l > 0) { var e = $('cpPreco'); if (e) e.value = (t/l).toFixed(3); }
  else if (t > 0 && p > 0) { var e2 = $('cpLitros'); if (e2) e2.value = (t/p).toFixed(2); }
  App.previaParada();
};

App.previaParada = function () {
  var el = $('cpPrevia');
  if (!el) return;

  var total = UI.n('cpTotal');
  var litros = UI.n('cpLitros');

  var prev = 0;
  for (var i = 0; i < App._paradas.length; i++) {
    var x = App._paradas[i];
    if (x.id === App._paradaAtual) { prev = x.valorPrevisto; break; }
  }

  if (total <= 0) { el.innerHTML = ''; return; }

var dif = prev - total;

el.innerHTML =
  '<div class="pr-lin">' +
    '<span>Você vai lançar</span>' +
    '<b>' +
      U.num(litros, 1) +
      ' L · ' +
      U.moeda(total) +
    '</b>' +
  '</div>' +
  (
    prev > 0
      ? '<div class="pr-lin ' +
        (
          dif > 0
            ? 'bom'
            : (
                dif < 0
                  ? 'ruim'
                  : ''
              )
        ) +
        '">' +
          '<span>' +
            (
              dif > 0
                ? 'Economia'
                : (
                    dif < 0
                      ? 'Acima do previsto'
                      : 'No previsto'
                  )
            ) +
          '</span>' +
          '<b>' +
            (
              dif > 0
                ? '+'
                : (
                    dif < 0
                      ? '-'
                      : ''
                  )
            ) +
            U.moeda(Math.abs(dif)) +
          '</b>' +
        '</div>'
      : ''
  );
};

App.vincularAbastParada = function (paradaId) {
  if (!VIAGEM_ABERTA) return;

  UI.load(true,'Buscando abastecimentos…');

  api('abastecimentosLivresDaViagem', VIAGEM_ABERTA).then(function (lista) {
    UI.load(false);

    if (!lista || !lista.length) {
      return UI.modal('Vincular abastecimento',
        UI.vazio('local_gas_station',
          'Nenhum abastecimento desta viagem está livre.<br>' +
          'Use <b>Abasteci aqui</b> para lançar um novo.'), null);
    }

    var html = '<div class="aviso info"><span class="ms">link</span><div>' +
      '<b>Escolha o abastecimento</b>' +
      'Ele será vinculado a esta parada.</div></div>' +
      '<div class="lista">' + lista.map(function (a) {
        return '<div class="item clicavel" onclick="App.confirmarVinculo(\''+paradaId+'\',\''+a.id+'\')">' +
          '<div class="av"><span class="ms">local_gas_station</span></div>' +
          '<div class="txt"><b>'+U.num(a.litros,2)+' L · '+U.moeda(a.valorTotal)+'</b>' +
          '<small>'+U.data(a.data)+' · '+U.num(a.km)+' km<br>' +
          U.esc(a.posto||'Posto não informado')+'</small></div></div>';
      }).join('') + '</div>';

    UI.modal('Vincular abastecimento', html, null);

  }).catch(function (e) {
    UI.load(false); UI.toast(e.message,'erro');
  });
};

App.confirmarVinculo = function (paradaId, abastecimentoId) {
  UI.fecharModal();
  UI.load(true,'Vinculando…');

  api('vincularAbastecimentoParada', paradaId, abastecimentoId).then(function (r) {
    var msg = 'Vinculado a ' + (r.posto || 'posto');
    if (r.diferenca > 0.01) {
  msg +=
    ' · economizou ' +
    U.moeda(r.diferenca);
} else if (r.diferenca < -0.01) {
  msg +=
    ' · ' +
    U.moeda(Math.abs(r.diferenca)) +
    ' acima do previsto';
}
    return App.aposSalvar(msg);
  }).catch(function (e) {
    UI.load(false); UI.toast(e.message,'erro');
  });
};

App.ignorarParada = function (paradaId) {
  UI.confirmar({
    titulo: 'Marcar como não realizada',
    mensagem: 'Esta parada será marcada como não realizada. Você pode reativá-la depois, se precisar.',
    textoBotao: 'Marcar como não realizada',
    icone: 'block',
    aoConfirmar: function () {
      UI.load(true,'Atualizando…');
      api('ignorarParada', paradaId, '').then(function (r) {
        return App.aposSalvar('Parada ' + r.ordem + ' marcada como não realizada');
      }).catch(function (e) {
        UI.load(false); UI.toast(e.message,'erro');
      });
    }
  });
};

App.reabrirParada = function (paradaId) {
  var parada = null;

  for (
    var i = 0;
    i < App._paradas.length;
    i++
  ) {
    if (
      App._paradas[i].id === paradaId
    ) {
      parada = App._paradas[i];
      break;
    }
  }

  if (!parada) {
    UI.toast(
      'Parada não encontrada',
      'erro'
    );

    return;
  }

  var temAbastecimento =
    !!parada.abastecimentoId;

  var html =
    '<div class="aviso">' +
      '<span class="ms">undo</span>' +
      '<div>' +
        '<b>Desfazer esta parada?</b>' +
        'A parada voltará para o estado pendente.' +
      '</div>' +
    '</div>';

  if (temAbastecimento) {
    html +=
      '<div class="form">' +
        '<div class="switch">' +
          '<span>' +
            '<b>Excluir o abastecimento lançado</b>' +
            '<small style="display:block;margin-top:3px">' +
              'Desmarque somente se quiser manter o abastecimento no histórico.' +
            '</small>' +
          '</span>' +
          '<input type="checkbox" id="rpExcluir" checked>' +
        '</div>' +
      '</div>';
  }

  UI.modal(
    'Desfazer parada',
    html,
    function () {
      var excluirAbastecimento =
        temAbastecimento
          ? UI.chk('rpExcluir')
          : false;

      UI.fecharModal();

      UI.load(
        true,
        excluirAbastecimento
          ? 'Excluindo abastecimento e reabrindo...'
          : 'Desvinculando e reabrindo...'
      );

      api(
        'reabrirParada',
        paradaId,
        excluirAbastecimento
      ).then(function (resultado) {
        var mensagem =
          'Parada ' +
          resultado.ordem +
          ' reaberta';

        if (
          resultado.abastecimentoExcluido
        ) {
          mensagem +=
            ' · abastecimento excluído';
        } else if (temAbastecimento) {
          mensagem +=
            ' · abastecimento mantido no histórico';
        }

        return App.aposSalvar(
          mensagem
        );
      }).catch(function (erro) {
        UI.load(false);

        UI.toast(
          erro.message,
          'erro'
        );
      });
    },
    'Desfazer'
  );
};

/* =====================================================================
   VIAGEM — Planejador, Postos e Mapas (Google Maps Platform)
   ===================================================================== */

var URL_MAPS_DIR = 'https://www.google.com/maps/dir/?api=1&destination=';

function linkComoChegar(lat, lon, texto) {
  return '<a href="' + URL_MAPS_DIR + lat + ',' + lon +
         '" target="_blank" rel="noopener">' + (texto || 'Como chegar') + '</a>';
}

var Viagem = {
  map:null, camadas:[], marcadores:[], plano:null, rotaSel:0,
  postosCache:{}, meuPonto:null, voltarPara:'viagens', cancelado:false,
  ultimaBusca:null, mapaV:null, camadasV:[], rotaCache:{},

  trechoParada: function (x) {
    return String((x && x.trecho) || 'IDA').toUpperCase() === 'VOLTA' ? 'VOLTA' : 'IDA';
  },
  nomeParada: function (x, indice) {
    if (x && x.postoNome) return x.postoNome;
    return 'Parada ' + ((x && x.ordemTrecho) || (indice + 1));
  },

  montarMapaViagem: function (v) {
    var bloco = $('blocoMapaViagem');
    if (!bloco) return;
    bloco.classList.remove('oculto');
    if (!v.temRota) {
      setHTML('mapaViagemInfo','<div class="mv-vazio"><span class="ms">map</span>' +
        '<div><b>Sem rota salva</b><small>Trace a rota para ver o mapa e as paradas.</small></div></div>');
      setHTML('mapaViagemAcoes',
        '<button class="btn primario bloco-full" onclick="Viagem.tracarRotaDaViagem(\''+v.id+'\')">' +
        '<span class="ms">route</span> Traçar rota desta viagem</button>');
      var mv = $('mapaViagem'); if (mv) mv.classList.add('oculto');
      return;
    }
    var mv2 = $('mapaViagem'); if (mv2) mv2.classList.remove('oculto');
    setHTML('mapaViagemInfo','<div class="mv-carregando"><i class="mini-loader"></i> Carregando a rota…</div>');
    setHTML('mapaViagemAcoes','');

    function desenhar(r) {
      if (!r || !r.coords || !r.coords.length) {
        setHTML('mapaViagemInfo','<div class="mv-vazio"><span class="ms">map</span>' +
          '<div><b>Rota não pôde ser lida</b></div></div>');
        setHTML('mapaViagemAcoes',
          '<button class="btn primario bloco-full" onclick="Viagem.tracarRotaDaViagem(\''+v.id+'\')">' +
          '<span class="ms">route</span> Traçar novamente</button>');
        return;
      }
      Viagem.pintarMapaViagem(v, r);

      var paradas = r.pontosParada || [];
      var ida = paradas.filter(function (x) { return Viagem.trechoParada(x) === 'IDA'; });
      var volta = paradas.filter(function (x) { return Viagem.trechoParada(x) === 'VOLTA'; });

      var infoPedagio = '';
      if (Number(r.custoPedagio) > 0) {
        infoPedagio = '<div class="mv-linha"><span class="ms">toll</span>' +
          U.moeda(r.custoPedagio) + ' de pedágio estimado</div>';
      } else if (r.temPedagio) {
        infoPedagio = '<div class="mv-linha"><span class="ms">toll</span>' +
          'Rota com pedágio, valor não informado</div>';
      }

      var listaParadas = '';
      var custoParadas = 0;

      if (paradas.length) {
        paradas.forEach(function (x) {
          custoParadas += Number(x.valorPrevisto) || 0;
        });

        listaParadas = paradas.map(function (x, i) {
          var t = Viagem.trechoParada(x);
          var litros = Number(x.litrosPrevisto) || 0;
          var valor = Number(x.valorPrevisto) || 0;
          return '<div class="mv-linha"><span class="ms">local_gas_station</span>' +
            '<div><b>' + t + ' ' + ((x.ordemTrecho || i+1)) + '</b> ' +
            U.esc(Viagem.nomeParada(x, i)) +
            '<br>km ' + U.num(x.kmNoTrecho || x.kmAcum || 0, 1) +
            (litros > 0 ? ' · ' + U.num(litros, 1) + ' L · ' + U.moeda(valor) : '') +
            '</div></div>';
        }).join('');

        if (custoParadas > 0) {
          listaParadas += '<div class="mv-linha"><span class="ms">payments</span>' +
            '<b>' + U.moeda(custoParadas) + '</b> previstos em combustível</div>';
        }
      }

      setHTML('mapaViagemInfo',
        '<div class="mv-linha"><span class="ms">straighten</span>' + U.num(r.km||v.distancia,1) + ' km' +
        (r.minutos ? ' · ' + U.hm(r.minutos) : '') + (v.idaVolta ? ' · ida e volta' : '') + '</div>' +
        (paradas.length
          ? '<div class="mv-linha"><span class="ms">local_gas_station</span>' +
            paradas.length + ' parada(s) · ida ' + ida.length + ' · volta ' + volta.length + '</div>'
          : '') +
        listaParadas +
        infoPedagio);

      setHTML('mapaViagemAcoes',
        '<button class="btn ghost" onclick="Viagem.abrirMapaCheio(\''+v.id+'\')">' +
        '<span class="ms">fullscreen</span> Tela cheia</button>' +
        '<button class="btn ghost" onclick="Viagem.tracarRotaDaViagem(\''+v.id+'\')">' +
        '<span class="ms">edit_road</span> Refazer</button>' +
        '<button class="btn ghost" onclick="Viagem.postosDaRotaSalva(\''+v.id+'\')">' +
        '<span class="ms">local_gas_station</span> Postos</button>');
    }

    if (Viagem.rotaCache[v.id]) { desenhar(Viagem.rotaCache[v.id]); return; }
    api('lerRotaViagem', v.id).then(function (r) {
      Viagem.rotaCache[v.id] = r; desenhar(r);
    }).catch(function () {
      setHTML('mapaViagemInfo','<div class="mv-vazio"><span class="ms">error</span>' +
        '<div><b>Não consegui carregar a rota</b></div></div>');
    });
  },

  pintarMapaViagem: function (v, r) {
    var el = $('mapaViagem');
    if (!el || typeof L === 'undefined') return;
    el.classList.remove('oculto');
    if (!Viagem.mapaV) {
      Viagem.mapaV = L.map('mapaViagem', { zoomControl:true, attributionControl:false })
        .setView([-15.7939,-47.8828], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(Viagem.mapaV);
    }
    Viagem.camadasV.forEach(function (c) { Viagem.mapaV.removeLayer(c); });
    Viagem.camadasV = [];
    var vc = U.veic(v.veiculoId);
    var cor = vc ? U.hex(vc.cor) : '#3b82f6';
    var pts = r.coords.map(function (c) { return [c[1], c[0]]; });
    var linha = L.polyline(pts, { color:cor, weight:5, opacity:0.9 }).addTo(Viagem.mapaV);
    Viagem.camadasV.push(linha);

    if (r.origem) Viagem.camadasV.push(L.marker([r.origem.lat, r.origem.lon]).addTo(Viagem.mapaV)
      .bindPopup('<b>Saída</b><br>'+U.esc(r.origem.curto||v.origem)));
    if (r.destino) Viagem.camadasV.push(L.marker([r.destino.lat, r.destino.lon]).addTo(Viagem.mapaV)
      .bindPopup('<b>Destino</b><br>'+U.esc(r.destino.curto||v.destino)));

    (r.pontosParada||[]).forEach(function (p, i) {
      if (!p.lat || !p.lon) return;
      var t = Viagem.trechoParada(p);
      var corParada = (t === 'VOLTA') ? '#8b5cf6' : '#22c55e';
      var ordem = p.ordemTrecho || (i+1);
      var ico = L.divIcon({
        className:'',
        html:'<div class="marcador-num" style="background:'+corParada+';color:#fff;border:2px solid #fff">'+ordem+'</div>',
        iconSize:[24,24], iconAnchor:[12,12]
      });
      var litros = Number(p.litrosPrevisto) || 0;
      var valor = Number(p.valorPrevisto) || 0;
      var popup = '<b>'+t+' · Parada '+ordem+'</b><br>' +
        '<b>'+U.esc(Viagem.nomeParada(p, i))+'</b><br>' +
        'km ' + U.num(p.kmNoTrecho || p.kmAcum || 0, 1) +
        (litros > 0 ? '<br>Abastecer ' + U.num(litros,1) + ' L' +
          (valor > 0 ? ' · ' + U.moeda(valor) : '') : '') +
        (p.postoEndereco ? '<br>'+U.esc(p.postoEndereco) : '') +
        (p.motivo ? '<br><small>'+U.esc(p.motivo)+'</small>' : '');
      Viagem.camadasV.push(L.marker([p.lat,p.lon],{icon:ico}).addTo(Viagem.mapaV).bindPopup(popup));
    });

    (r.pontosPedagio||[]).forEach(function (x) {
      if (!x.lat || !x.lon) return;
      var ico = L.divIcon({ className:'', html:'<div class="marcador-ped">P</div>', iconSize:[20,20], iconAnchor:[10,10] });
      Viagem.camadasV.push(L.marker([x.lat,x.lon],{icon:ico}).addTo(Viagem.mapaV)
        .bindPopup('<b>'+U.esc(x.nome||'Pedágio')+'</b>'));
    });

    setTimeout(function () {
      Viagem.mapaV.invalidateSize();
      try { Viagem.mapaV.fitBounds(linha.getBounds(), { padding:[25,25] }); } catch (e) {}
    }, 120);
  },

  ajustarMapaViagem: function () { if (Viagem.mapaV) Viagem.mapaV.invalidateSize(); },

  abrirMapaCheio: function (viagemId) {
    var v = U.viagem(viagemId);
    var r = Viagem.rotaCache[viagemId];
    if (!v || !r) return;
    var vc = U.veic(v.veiculoId) || {};
    Viagem.plano = {
      origem: r.origem || { lat:0, lon:0, curto:v.origem },
      destino: r.destino || { lat:0, lon:0, curto:v.destino },
      veiculoId: v.veiculoId, veiculoNome: U.nomeVeic(v.veiculoId),
      veiculoTipo: vc.tipo || 'carro', veiculoCor: vc.cor || 'azul',
      idaVolta: v.idaVolta,
      rotas: [{ nome: v.titulo || 'Rota da viagem', km: r.km || v.distancia,
        kmSoIda: (r.km||v.distancia)/(v.idaVolta?2:1),
        minutos: r.minutos || 0, minutosSoIda: (r.minutos||0)/(v.idaVolta?2:1),
        custoTotal: v.totalPrev || 0, pracas: r.pracas || 0, coords: r.coords,
        pontosPedagio: r.pontosPedagio || [], pontosParada: r.pontosParada || [],
        pontosApoio: r.pontosApoio || [],
        custoCombustivel: v.combustivelPrev || 0,
        custoPedagio: r.custoPedagio || v.pedagioPrev || 0,
        temPedagio: r.temPedagio || 0,
        litros: 0, qtdParadas: (r.pontosParada||[]).length, pedagioCalculado: 1,
        autonomia: r.autonomia || null }],
      parametros: { kmL:0, tanque:0, nivelPct:100, reservaPct:15, precoLitro:0 }
    };
    Viagem.rotaSel = 0;
    Viagem.voltarPara = 'viagem';
    App.irPara('mapa');
    setTimeout(function () { Viagem.initMapa(); Viagem.desenhar(); }, 250);
  },

  tracarRotaDaViagem: function (viagemId) {
    var v = U.viagem(viagemId);
    if (!v) return;
    var veic = U.veic(v.veiculoId) || {};
    var c = veic.consumo || {};
    var html = '<div class="aviso info"><span class="ms">route</span><div><b>Traçar a rota</b>' +
      'Busco o caminho de <b>'+U.esc(v.origem)+'</b> até <b>'+U.esc(v.destino)+'</b> ' +
      'e calculo autonomia, paradas e pedágio.</div></div>' +
      '<div class="form">' +
      Geo.campo('rtOrig','Saindo de','Cidade, endereço ou CEP', v.origem) +
      Geo.campo('rtDest','Indo para','Cidade, endereço ou CEP', v.destino) +
      '<div class="switch"><span>Ida e volta</span>' +
      '<input type="checkbox" id="rtIdaVolta"'+(v.idaVolta?' checked':'')+'></div>' +
      '<div class="linha2">' +
        campo('Consumo (km/L)','<input id="rtKmL" type="number" step="0.1" value="'+(c.mediaKmL||'')+'">') +
        campo('Tanque (L)','<input id="rtTanque" type="number" step="0.5" value="'+(veic.tanque||'')+'">') + '</div>' +
      '<div class="aviso verde"><span class="ms">toll</span><div><b>Pedágio automático</b>' +
      'O valor é solicitado junto com a rota pela Google Routes API.</div></div>' +
      '</div>';

    UI.modal('Rota da viagem', html, function () {
      var o = UI.v('rtOrig'), d = UI.v('rtDest');
      if (!o || !d) return UI.toast('Informe origem e destino','erro');
      UI.fecharModal();
      Viagem.cancelado = false;
      UI.load(true,'Traçando rota, paradas e pedágio…', function () { Viagem.cancelado = true; });

      var op = {
        origem:o, destino:d, veiculoId:v.veiculoId,
        combustivel: veic.combustivel || '',
        kmL: UI.n('rtKmL') || c.mediaKmL || 10,
        tanque: UI.n('rtTanque') || veic.tanque || 50,
        precoLitro: c.precoMedioLitro || 0,
        idaVolta: UI.chk('rtIdaVolta'),
        tarifaPedagio: 12
      };

      comPrazo(api('planejarViagem', op), 60000, 'O serviço de rotas demorou.')
        .then(function (p) {
          if (Viagem.cancelado) return null;
          if (!p || !p.rotas || !p.rotas.length) throw new Error('Nenhuma rota encontrada.');
          var indice = p.recomendada || 0;
          var r = p.rotas[indice];
          var pacote = {
            coords:r.coords, km:r.km, minutos:r.minutos,
            origem:p.origem, destino:p.destino,
            pontosParada:r.pontosParada || [], pontosApoio:r.pontosApoio || [],
            autonomia:r.autonomia || null,
            pracas:r.pracas || 0,
            temPedagio:r.temPedagio || 0,
            custoPedagio:r.custoPedagio || 0,
            moedaPedagio:r.moedaPedagio || 'BRL',
            pedagioCalculado:1,
            metodoPedagio:r.metodoPedagio || '',
            avisoPedagio:r.avisoPedagio || '',
            pontosPedagio:r.pontosPedagio || []
          };
          return { p:p, r:r, pacote:pacote };
        })
        .then(function (res) {
          if (!res || Viagem.cancelado) { UI.load(false); return; }
          UI.progresso('Salvando rota…');
          return api('salvarRotaViagem', viagemId, JSON.stringify(res.pacote)).then(function () {
            return api('salvar','Viagens', {
              id: viagemId,
              distancia: res.r.km,
              idaVolta: op.idaVolta ? 'SIM' : 'NAO',
              combustivelPrev: res.r.custoCombustivel,
              pedagioPrev: res.r.custoPedagio || 0,
              pracas: res.r.pracas || 0
            });
          }).then(function () {
            delete Viagem.rotaCache[viagemId];
            return App.aposSalvar('Rota salva · ' + (res.r.qtdParadas || 0) + ' parada(s) calculada(s)');
          });
        })
        .catch(function (e) { UI.load(false); UI.toast(e.message || 'Falha ao traçar','erro'); });
    }, 'Traçar e salvar');
  },

  postosDaRotaSalva: function (viagemId) {
    var r = Viagem.rotaCache[viagemId];
    if (!r) return UI.toast('Rota não carregada','erro');
    var alvos = (r.pontosParada && r.pontosParada.length) ? r.pontosParada : (r.pontosApoio || []);
    if (!alvos.length && r.origem) return Viagem.postosPertoDe(r.origem.lat, r.origem.lon);
    Viagem.abrirMapaCheio(viagemId);
    setTimeout(function () { Viagem.carregarPostos(Viagem.plano.rotas[0]); }, 700);
  },

  abrirBuscaPostos: function () {
    Geo.limpar();
    var html = '<div class="aviso info"><span class="ms">travel_explore</span><div><b>Postos por perto</b>' +
      'Mostro os postos num raio de <b>10 km</b>, com link para navegar.</div></div>' +
      '<div class="form">' +
      Geo.campo('bpEnd','Onde procurar','Cidade, endereço ou CEP','',
        '<div class="chips" style="margin-top:7px"><div class="chip" onclick="Viagem.usarGpsBusca()">' +
        '<span class="ms">my_location</span>Usar minha localização</div></div>') +
      campo('Raio da busca','<select id="bpRaio">' +
        '<option value="5000">5 km — bem perto</option>' +
        '<option value="10000" selected>10 km — recomendado</option>' +
        '<option value="20000">20 km — região</option>' +
        '<option value="40000">40 km — estrada</option></select>') + '</div>';
    UI.modal('Buscar postos', html, function () { Viagem.executarBuscaPostos(); }, 'Buscar');
  },

  usarGpsBusca: function () {
    if (!navigator.geolocation) return UI.toast('GPS indisponível','erro');
    Geo.estado('bpEnd','carregando');
    navigator.geolocation.getCurrentPosition(function (p) {
      Viagem.meuPonto = { lat:p.coords.latitude, lon:p.coords.longitude };
      var el = $('bpEnd'); if (el) el.value = 'Minha localização';
      Geo.ultimo['bpEnd'] = 'Minha localização';
      var box = $('sugbpEnd'); if (box) { box.innerHTML=''; box.classList.remove('aberto'); }
      Geo.estado('bpEnd','ok');
      UI.toast('Localização obtida','ok');
    }, function () { Geo.estado('bpEnd',''); UI.toast('Não foi possível obter o GPS','erro'); },
      { enableHighAccuracy:true, timeout:10000 });
  },

  executarBuscaPostos: function () {
    var end = UI.v('bpEnd');
    var raio = UI.n('bpRaio') || 10000;
    if (!end) return UI.toast('Informe onde procurar','erro');
    var usarGps = (end === 'Minha localização' && Viagem.meuPonto);
    var op = usarGps ? { lat:Viagem.meuPonto.lat, lon:Viagem.meuPonto.lon, raio:raio }
                     : { endereco:end, raio:raio };
    UI.fecharModal();
    Viagem.cancelado = false;
    UI.load(true, 'Procurando postos…', function () { Viagem.cancelado = true; });
    comPrazo(api('buscarPostos', op), 45000, 'Servidores de mapa ocupados.')
      .then(function (r) {
        if (Viagem.cancelado) return;
        UI.load(false); Viagem.ultimaBusca = r; Viagem.mostrarPostos(r);
      })
      .catch(function (e) {
        if (Viagem.cancelado) return;
        UI.load(false);
        UI.modal('Não consegui buscar os postos',
          '<div class="aviso"><span class="ms">error</span><div><b>Motivo</b>'+U.esc(e.message||'')+'</div></div>' +
          '<div class="acao-topo" style="margin-top:12px">' +
          '<button class="btn primario bloco-full" onclick="UI.fecharModal();Viagem.abrirBuscaPostos()">' +
          '<span class="ms">refresh</span> Tentar de novo</button></div>', null);
      });
  },

  mostrarPostos: function (r) {
    if (!r || !r.postos || !r.postos.length) {
      return UI.modal('Postos por perto',
        '<div class="hub-periodo"><span class="ms">location_on</span>'+U.esc((r&&r.centro&&r.centro.nome)||'')+'</div>' +
        UI.vazio('local_gas_station','Nenhum posto mapeado num raio de '+((r&&r.raioUsado)||10)+' km.'), null);
    }
    var html = '<div class="hub-periodo"><span class="ms">location_on</span>' +
      U.esc(r.centro.nome) + ' · raio de ' + r.raioUsado + ' km</div>';
    html += '<div class="hub-resumo">' +
      '<div class="hr-item"><b>'+r.total+'</b><small>postos</small></div>' +
      '<div class="hr-item v"><b>'+r.postos[0].desvioKm+' km</b><small>o mais próximo</small></div></div>';
    html += '<div class="lista-postos">' + r.postos.map(function (p, i) {
      var tags = [];
      if (p.h24) tags.push('<span class="pt-tag h24">Aberto agora</span>');
      if (Number(p.rating) > 0) tags.push('<span class="pt-tag">⭐ '+U.num(p.rating,1)+'</span>');
      return '<div class="posto-item"><div class="pi-num">'+(i+1)+'</div>' +
        '<div class="pi-txt"><b>'+U.esc(p.nome)+'</b>' +
        '<small>'+(p.endereco ? U.esc(p.endereco) : 'endereço não informado')+'</small>' +
        (tags.length ? '<div class="pi-tags">'+tags.join('')+'</div>' : '') + '</div>' +
        '<div class="pi-dist"><b>'+p.desvioKm+'</b><small>km</small>' +
        '<a class="pi-ir" href="' + URL_MAPS_DIR + p.lat + ',' + p.lon + '" ' +
        'target="_blank" rel="noopener"><span class="ms">navigation</span></a></div></div>';
    }).join('') + '</div>';
    html += '<div class="acao-topo" style="margin-top:14px">' +
      '<button class="btn primario bloco-full" onclick="Viagem.postosNoMapa()">' +
      '<span class="ms">map</span> Ver todos no mapa</button></div>';
    UI.modal('Postos por perto', html, null);
  },

  postosNoMapa: function () {
    var r = Viagem.ultimaBusca;
    if (!r) return;
    UI.fecharModal();
    Viagem.voltarPara = PAGINA === 'mapa' ? 'viagens' : PAGINA;
    App.irPara('mapa');
    setTimeout(function () {
      Viagem.initMapa();
      if (!Viagem.map) return;
      Viagem.limpar();
      Viagem.map.setView([r.centro.lat, r.centro.lon], 12);
      Viagem.marcadores.push(L.marker([r.centro.lat, r.centro.lon]).addTo(Viagem.map)
        .bindPopup('<b>'+U.esc(r.centro.nome)+'</b>'));
      r.postos.forEach(function (p, i) {
        var ico = L.divIcon({ className:'', html:'<div class="marcador-posto">'+(i+1)+'</div>',
                              iconSize:[24,24], iconAnchor:[12,12] });
        Viagem.marcadores.push(L.marker([p.lat,p.lon],{icon:ico}).addTo(Viagem.map)
          .bindPopup('<b>'+U.esc(p.nome)+'</b><br>'+U.esc(p.endereco||'') +
            '<br>'+p.desvioKm+' km<br>' + linkComoChegar(p.lat, p.lon)));
      });
      try {
        var g = L.featureGroup(Viagem.marcadores);
        Viagem.map.fitBounds(g.getBounds(), { padding:[40,40], maxZoom:14 });
      } catch (e) {}
      setHTML('tituloMapa','<b>'+r.total+' posto(s) perto de '+U.esc(r.centro.nome)+'</b>' +
        '<small>raio de '+r.raioUsado+' km</small>');
      setHTML('legendaMapa','<span><i class="dot" style="background:#22c55e"></i>Posto</span>');
    }, 250);
  },

  abrirPlanejador: function () {
    if (!U.temVeiculo()) return;
    Geo.limpar();
    var v = U.veicAtual();
    var c = v.consumo || {};
    var temHist = c.mediaKmL > 0;
    var semTanque = !(v.tanque > 0);

    var aviso = temHist
      ? '<div class="aviso info"><span class="ms">verified</span><div><b>Consumo de '+U.esc(v.nome)+'</b>' +
        c.mediaKmL + ' km/L, de ' + c.abastecimentos + ' abastecimento(s).</div></div>'
      : '<div class="aviso"><span class="ms">edit_note</span><div><b>Informe o consumo</b>' +
        U.esc(v.nome)+' ainda não tem 2 abastecimentos. Use o km/L do manual.</div></div>';
    if (semTanque) {
      aviso += '<div class="aviso"><span class="ms">local_gas_station</span><div><b>Tanque não cadastrado</b>' +
        'Sem a capacidade do tanque não dá para calcular as paradas.</div></div>';
    }

    var html = '<div class="form">' + UI.seletorVeiculo('pVeic', v.id, 'Qual veículo vai na viagem?') + '</div>' +
      '<div id="boxAviso">' + aviso + '</div><div class="form">' +
      Geo.campo('pOrigem','Saindo de','Cidade, endereço ou CEP','',
        '<div class="chips" style="margin-top:7px"><div class="chip" onclick="Viagem.usarLocalizacao()">' +
        '<span class="ms">my_location</span>Usar minha localização</div></div>') +
      Geo.campo('pDestino','Indo para','Cidade, endereço ou CEP','') +
      '<div class="ida-volta" id="boxIdaVolta">' +
        '<button type="button" class="iv-op sel" data-iv="0" onclick="Viagem.setIdaVolta(0)">' +
          '<span class="ms">east</span><b>Só ida</b><small>trajeto simples</small></button>' +
        '<button type="button" class="iv-op" data-iv="1" onclick="Viagem.setIdaVolta(1)">' +
          '<span class="ms">sync_alt</span><b>Ida e volta</b><small>dobra o custo</small></button>' +
        '<input type="hidden" id="pIdaVolta" value="0"></div>' +
      '<div class="linha2">' +
        campo('Consumo (km/L)','<input id="pKmL" type="number" inputmode="decimal" step="0.1" value="'+(temHist?c.mediaKmL:'')+'" placeholder="11.5" oninput="Viagem.previewAutonomia()">') +
        campo('Tanque (L)','<input id="pTanque" type="number" inputmode="decimal" step="0.5" value="'+(v.tanque>0?v.tanque:'')+'" placeholder="50" oninput="Viagem.previewAutonomia()">') + '</div>' +
      '<div class="linha2">' +
        campo('Tanque agora','<select id="pNivel" onchange="Viagem.previewAutonomia()">' +
          '<option value="100">Cheio (100%)</option><option value="75">3/4</option>' +
          '<option value="50">Metade</option><option value="25">1/4</option>' +
          '<option value="10">Reserva</option></select>') +
        campo('Margem segurança','<select id="pReserva" onchange="Viagem.previewAutonomia()">' +
          '<option value="10">10% do tanque</option><option value="15" selected>15%</option>' +
          '<option value="20">20%</option><option value="25">25% (estrada isolada)</option></select>') + '</div>' +
      '<div class="autonomia-mini" id="autoPreview"></div>' +
      '<div class="linha2">' +
        campo('Preço do litro','<input id="pPreco" type="number" inputmode="decimal" step="0.01" value="'+(c.precoMedioLitro>0?c.precoMedioLitro.toFixed(2):'')+'" placeholder="6.29">') +
        campo('Tarifa por praça','<input id="pTarifa" type="number" inputmode="decimal" step="0.5" value="12">') + '</div>' +
      '<div class="aviso verde"><span class="ms">toll</span><div><b>Pedágio automático</b>' +
      'O valor vem junto com a rota pela Google Routes API.</div></div>' +
      '</div>';

    UI.modal('Planejar viagem', html, function () { Viagem.executar(); }, 'Buscar rotas');
    Viagem.previewAutonomia();

    UI._aoTrocarVeic = function (novoId) {
      var nv = U.veic(novoId); if (!nv) return;
      var nc = nv.consumo || {};
      var a=$('pKmL'); if(a) a.value = nc.mediaKmL > 0 ? nc.mediaKmL : '';
      var b=$('pTanque'); if(b) b.value = nv.tanque > 0 ? nv.tanque : '';
      var d=$('pPreco'); if(d) d.value = nc.precoMedioLitro > 0 ? nc.precoMedioLitro.toFixed(2) : '';
      setHTML('boxAviso', nc.mediaKmL > 0
        ? '<div class="aviso info"><span class="ms">verified</span><div><b>Consumo de '+U.esc(nv.nome)+'</b>' +
          nc.mediaKmL+' km/L, de '+nc.abastecimentos+' abastecimento(s).</div></div>'
        : '<div class="aviso"><span class="ms">edit_note</span><div><b>Informe o consumo</b>' +
          U.esc(nv.nome)+' ainda não tem 2 abastecimentos.</div></div>');
      Viagem.previewAutonomia();
    };
  },

  previewAutonomia: function () {
    var el = $('autoPreview');
    if (!el) return;
    var kmL = UI.n('pKmL'), tanque = UI.n('pTanque');
    var nivel = UI.n('pNivel') || 100, reserva = UI.n('pReserva') || 15;
    if (kmL <= 0 || tanque <= 0) {
      el.innerHTML = '<div class="am-vazio"><span class="ms">info</span>' +
        'Informe consumo e tanque para eu calcular a autonomia e as paradas.</div>';
      return;
    }
    var lReserva = tanque * (reserva/100);
    var lUteis = tanque - lReserva;
    var lAgora = tanque * (nivel/100);
    var autCheia = Math.round(kmL * tanque);
    var autUtil = Math.round(kmL * lUteis);
    var autIni = Math.round(kmL * Math.max(0, lAgora - lReserva));
    el.innerHTML = '<div class="am-grid">' +
      '<div><b>'+U.num(autCheia)+'</b><small>km tanque cheio</small></div>' +
      '<div><b>'+U.num(autIni)+'</b><small>km agora ('+nivel+'%)</small></div>' +
      '<div><b>'+U.num(autUtil)+'</b><small>km entre paradas</small></div></div>' +
      '<div class="am-nota"><span class="ms">calculate</span>' +
      tanque+' L × '+kmL+' km/L, guardando '+reserva+'% ('+lReserva.toFixed(1)+' L) de reserva.</div>';
  },

  setIdaVolta: function (v) {
    var box = $('boxIdaVolta');
    if (box) [].forEach.call(box.querySelectorAll('.iv-op'), function (b) {
      b.classList.toggle('sel', b.getAttribute('data-iv') === String(v));
    });
    var f = $('pIdaVolta'); if (f) f.value = String(v);
  },

  usarLocalizacao: function () {
    if (!navigator.geolocation) return UI.toast('GPS indisponível','erro');
    Geo.estado('pOrigem','carregando');
    navigator.geolocation.getCurrentPosition(function (p) {
      Viagem.meuPonto = { lat:p.coords.latitude, lon:p.coords.longitude };
      var el = $('pOrigem'); if (el) el.value = 'Minha localização';
      Geo.ultimo['pOrigem'] = 'Minha localização';
      var box = $('sugpOrigem'); if (box) { box.innerHTML = ''; box.classList.remove('aberto'); }
      Geo.estado('pOrigem','ok');
      UI.toast('Localização obtida','ok');
    }, function () { Geo.estado('pOrigem',''); UI.toast('Não foi possível obter o GPS','erro'); },
      { enableHighAccuracy:true, timeout:10000 });
  },

  executar: function () {
    var o = UI.v('pOrigem'), d = UI.v('pDestino');
    if (!UI.v('pVeic')) return UI.toast('Escolha o veículo','erro');
    if (!o || !d) return UI.toast('Informe origem e destino','erro');
    if (UI.n('pKmL') <= 0) return UI.toast('Informe o consumo em km/L','erro');
    if (UI.n('pTanque') <= 0) return UI.toast('Informe a capacidade do tanque','erro');
    var usarGps = (o === 'Minha localização' && Viagem.meuPonto);
    var veicSel = U.veic(UI.v('pVeic')) || {};
    var op = {
      origem:o, destino:d, veiculoId:UI.v('pVeic'),
      combustivel: veicSel.combustivel || '',
      kmL:UI.n('pKmL'), tanque:UI.n('pTanque'), precoLitro:UI.n('pPreco'),
      tarifaPedagio:UI.n('pTarifa'), nivelPct:UI.v('pNivel'), reservaPct:UI.v('pReserva'),
      idaVolta: UI.v('pIdaVolta') === '1',
      origemLat: usarGps ? Viagem.meuPonto.lat : null,
      origemLon: usarGps ? Viagem.meuPonto.lon : null
    };
    Viagem._tarifa = UI.n('pTarifa') || 12;
    UI.fecharModal();
    Viagem.cancelado = false;
    UI.load(true, 'Traçando rota, paradas e pedágio…', function () { Viagem.cancelado = true; });
    comPrazo(api('planejarViagem', op), 60000, 'O serviço de rotas demorou.')
      .then(function (p) {
        if (Viagem.cancelado) return;
        if (!p || !p.rotas || !p.rotas.length) throw new Error('Nenhuma rota encontrada.');
        Viagem.plano = p; Viagem.postosCache = {}; Viagem.rotaSel = p.recomendada || 0;
        UI.load(false);
        Viagem.mostrarResultado();
      })
      .catch(function (e) {
        if (Viagem.cancelado) return;
        UI.load(false);
        UI.toast(e.message || 'Falha ao planejar','erro');
        setTimeout(function () {
          UI.modal('Não consegui buscar as rotas',
            '<div class="aviso"><span class="ms">error</span><div><b>Motivo</b>'+U.esc(e.message||'')+'</div></div>' +
            '<div class="acao-topo" style="margin:14px 0 0">' +
            '<button class="btn ghost bloco-full" onclick="UI.fecharModal();Viagem.abrirPlanejador()">' +
            '<span class="ms">refresh</span> Tentar de novo</button></div>', null);
        }, 300);
      });
  },

  buscarPedagio: function (i) {
    var p = Viagem.plano;
    if (!p || !p.rotas || !p.rotas[i]) return;
    p.rotas[i].pedagioCalculado = 1;
    if ($('modal') && $('modal').classList.contains('aberto')) {
      Viagem.mostrarResultado();
    }
  },

  grupoParadasHTML: function (titulo, lista, icone) {
    if (!lista.length) return '';

    var totalValor = 0;
    lista.forEach(function (x) { totalValor += Number(x.valorPrevisto) || 0; });

    var html = '<div class="aut-paradas"><b>' +
      '<span class="ms" style="font-size:16px;vertical-align:middle;margin-right:5px">'+icone+'</span>' +
      titulo +
      (totalValor > 0
        ? '<span style="float:right;font-weight:400;color:var(--txt2)">' + U.moeda(totalValor) + '</span>'
        : '') +
      '</b>';

    html += lista.map(function (x, indice) {
      var ordem = x.ordemTrecho || (indice + 1);
      var rating = Number(x.postoRating || x.rating || 0);
      var kmExibir = Number(x.kmNoTrecho || x.kmAcum || 0);
      var litros = Number(x.litrosPrevisto) || 0;
      var valor = Number(x.valorPrevisto) || 0;

      var custo = '';
      if (litros > 0) {
        custo = '<small style="color:var(--azul2)">' +
          U.num(litros, 1) + ' L' +
          (valor > 0 ? ' · ' + U.moeda(valor) : '') +
          (x.ultimaParada ? ' · só o necessário' : ' · tanque cheio') +
          '</small>';
      }

      return '<div class="ap-item"><i>'+ordem+'</i><div>' +
        '<b>'+U.esc(x.postoNome || 'Parada para abastecimento')+'</b>' +
        '<small>'+titulo+' · km '+U.num(kmExibir,1)+'</small>' +
        custo +
        (rating > 0 ? '<small>⭐ '+U.num(rating,1)+'</small>' : '') +
        (x.postoEndereco ? '<small>'+U.esc(x.postoEndereco)+'</small>' : '') +
        (x.ajustada ? '<small style="color:#fcd34d">Antecipada ' + U.num(x.recuoKm, 0) + ' km</small>' : '') +
        (x.semPosto ? '<small style="color:#fca5a5">Sem posto mapeado</small>' : '') +
        (x.motivo ? '<small>'+U.esc(x.motivo)+'</small>' : '') +
        '</div></div>';
    }).join('');

    return html + '</div>';
  },

  mostrarResultado: function () {
    var p = Viagem.plano;
    if (!p || !p.rotas || !p.rotas.length) return UI.toast('Nenhuma rota carregada.','erro');

    var pr = p.parametros || {};
    var sel = p.rotas[Viagem.rotaSel];
    if (!sel) { Viagem.rotaSel = 0; sel = p.rotas[0]; }
    var a = sel.autonomia || {};

    var head = '<div class="veic-unico" style="--c:'+U.hex(p.veiculoCor)+'">' +
      '<span class="ms">'+U.ico(p.veiculoTipo)+'</span>' +
      '<div><b>'+U.esc(p.veiculoNome)+'</b><small>'+U.num(pr.kmL||0,1)+' km/L · tanque '+U.num(pr.tanque||0,1)+' L' +
      (pr.tanqueEstimado ? ' (estimado)' : '') + '</small></div></div>' +
      '<div class="aviso info"><span class="ms">'+(p.idaVolta?'sync_alt':'route')+'</span><div>' +
      '<b>'+U.esc(p.origem.curto)+' '+(p.idaVolta?'⇄':'→')+' '+U.esc(p.destino.curto)+'</b>' +
      (p.idaVolta ? 'Ida e volta. Distância, combustível e pedágio já incluem o retorno.' : 'Somente ida.') +
      '</div></div>';

    var aut = '<div class="autonomia"><h4><span class="ms">battery_charging_full</span> Autonomia e paradas</h4>' +
      '<div class="aut-grid">' +
      '<div><b>'+U.num(a.autonomiaCheia||0)+'</b><small>km tanque cheio</small></div>' +
      '<div><b>'+U.num(a.autonomiaInicial||0)+'</b><small>km disponíveis ('+(a.nivelPct===undefined?100:a.nivelPct)+'%)</small></div>' +
      '<div><b>'+U.num(a.autonomiaUtil||0)+'</b><small>km entre paradas</small></div></div>';

    if (a.memoria && a.memoria.length) {
      aut += '<div class="aut-memoria">' + a.memoria.map(function (m) {
        return '<div><span class="ms">chevron_right</span>'+U.esc(m)+'</div>';
      }).join('') + '</div>';
    }

    var paradas = sel.pontosParada || [];

    if (paradas.length) {
      var ida = paradas.filter(function (x) { return Viagem.trechoParada(x) === 'IDA'; });
      var volta = paradas.filter(function (x) { return Viagem.trechoParada(x) === 'VOLTA'; });
      aut += Viagem.grupoParadasHTML('IDA', ida, 'east');
      aut += Viagem.grupoParadasHTML('VOLTA', volta, 'west');
    } else {
      aut += '<div class="aut-ok"><span class="ms">check_circle</span>Dá para fazer o trajeto sem abastecer.</div>';
    }

    aut += '</div>';

    var cards = p.rotas.map(function (r, i) {
      var ped;

      if (r.pedagioIndisponivel) {
        ped = '<b>—</b><small>indisponível</small>';
      } else if (!r.pedagioCalculado) {
        ped = '<i class="mini-loader"></i><small>calculando…</small>';
      } else if (Number(r.custoPedagio) > 0) {
        ped = '<b>'+U.moeda(r.custoPedagio)+'</b><small>pedágio estimado</small>';
      } else if (r.temPedagio) {
        ped = '<b>Pedágio</b><small>valor não disponível</small>';
      } else {
        ped = '<b>—</b><small>sem pedágio</small>';
      }

      var pRota = r.pontosParada || [];
      var pIda = pRota.filter(function (x) { return Viagem.trechoParada(x) === 'IDA'; });
      var pVolta = pRota.filter(function (x) { return Viagem.trechoParada(x) === 'VOLTA'; });

      var resumo = '';

      if (r.abastecerAntes) {
        resumo += '<div><b>Abasteça antes de sair</b></div>';
      }

      if (Number(r.custoNasParadas) > 0) {
        var jaNoTanque = Number(r.custoCombustivel) - Number(r.custoNasParadas);

        resumo += '<div style="margin-bottom:4px">' +
          '<b>' + U.moeda(r.custoNasParadas) + '</b> a pagar em ' +
          U.num(r.litrosNasParadas, 1) + ' L nas paradas</div>';

        if (jaNoTanque > 0.5) {
          resumo += '<div style="margin-bottom:4px;color:var(--txt2);font-size:11px">' +
            U.moeda(jaNoTanque) + ' já está no tanque</div>';
        }
      }

      if (!pRota.length) {
        resumo += '<div>Chega sem abastecer</div>';
      } else {
        if (pIda.length) {
          resumo += '<div style="margin-top:5px"><b>IDA:</b> ' + pIda.map(function (x, j) {
            return U.esc(Viagem.nomeParada(x, j)) + ' (km ' + U.num(x.kmNoTrecho || x.kmAcum || 0, 0) + ')';
          }).join(' · ') + '</div>';
        }
        if (pVolta.length) {
          resumo += '<div style="margin-top:3px"><b>VOLTA:</b> ' + pVolta.map(function (x, j) {
            return U.esc(Viagem.nomeParada(x, j)) + ' (km ' + U.num(x.kmNoTrecho || x.kmAcum || 0, 0) + ')';
          }).join(' · ') + '</div>';
        }
      }

      return '<div class="rota-op'+(i===Viagem.rotaSel?' sel':'')+'" onclick="Viagem.selecionar('+i+')">' +
        (r.selo ? '<span class="selo'+(r.selo.indexOf('econ')>-1?' eco':'')+'">'+U.esc(r.selo)+'</span>' : '') +
        '<div class="ro-top"><h5><span class="ms">alt_route</span>'+U.esc(r.nome)+'</h5>' +
        '<div class="ro-total"><b>'+U.moeda(r.custoTotal)+'</b><small>CUSTO PREVISTO</small></div></div>' +
        '<div class="ro-grid">' +
        '<div><b>'+U.num(r.km,1)+'</b><small>km'+(p.idaVolta?' (ida e volta)':'')+'</small></div>' +
        '<div><b>'+U.hm(r.minutos)+'</b><small>duração</small></div>' +
        '<div><b>'+U.moeda(r.custoCombustivel)+'</b><small>'+U.num(r.litros,1)+' L</small></div>' +
        '<div id="pedagio'+i+'">'+ped+'</div></div>' +
        '<div class="ro-paradas"><span class="ms">local_gas_station</span><div>'+resumo+'</div></div>' +
        (r.avisoPedagio ? '<div class="ro-aviso"><span class="ms">info</span>'+U.esc(r.avisoPedagio)+'</div>' : '') +
        '<div class="ro-acoes">' +
        '<button onclick="event.stopPropagation();Viagem.verNoMapa('+i+')"><span class="ms">map</span>Mapa</button>' +
        '<button class="pri" onclick="event.stopPropagation();Viagem.criarViagem('+i+')"><span class="ms">check</span>Escolher</button>' +
        '</div></div>';
    }).join('');

    UI.modal('Opções de rota', head + aut + cards, null);
  },

  reabrirResultado: function () {
    if (Viagem.plano) Viagem.mostrarResultado(); else Viagem.abrirPlanejador();
  },

  selecionar: function (i) {
    var p = Viagem.plano;
    if (!p || !p.rotas || !p.rotas[i]) return;
    Viagem.rotaSel = i;
    Viagem.mostrarResultado();
  },

  initMapa: function () {
    if (Viagem.map || !temEl('mapa')) return;
    Viagem.map = L.map('mapa', { zoomControl:true }).setView([-15.7939,-47.8828], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(Viagem.map);
  },
  ajustarMapa: function () { if (Viagem.map) Viagem.map.invalidateSize(); },
  limpar: function () {
    if (!Viagem.map) return;
    Viagem.camadas.forEach(function(c){ Viagem.map.removeLayer(c); });
    Viagem.marcadores.forEach(function(m){ Viagem.map.removeLayer(m); });
    Viagem.camadas = []; Viagem.marcadores = [];
  },

  verNoMapa: function (i) {
    Viagem.rotaSel = i;
    UI.fecharModal();
    Viagem.voltarPara = (PAGINA === 'mapa') ? 'viagens' : PAGINA;
    App.irPara('mapa');
    setTimeout(function () { Viagem.initMapa(); Viagem.desenhar(); }, 250);
  },

  desenhar: function () {
    var p = Viagem.plano;
    if (!temEl('mapa')) return;
    if (!p) {
      setHTML('tituloMapa','<b>Nenhuma rota carregada</b><small>Use "Ver opções".</small>');
      Viagem.initMapa(); return;
    }
    Viagem.initMapa(); Viagem.limpar();

    var sel = p.rotas[Viagem.rotaSel];
    if (!sel || !sel.coords || !sel.coords.length) return UI.toast('Rota sem coordenadas.','erro');
    var corV = U.hex(p.veiculoCor);

    p.rotas.forEach(function (r, i) {
      if (i === Viagem.rotaSel || !r.coords || !r.coords.length) return;
      var l = L.polyline(r.coords.map(function(c){ return [c[1],c[0]]; }),
        { color:'#64748b', weight:4, opacity:0.45, dashArray:'8,8' }).addTo(Viagem.map);
      l.on('click', function () { Viagem.rotaSel = i; Viagem.desenhar(); });
      Viagem.camadas.push(l);
    });

    var linha = L.polyline(sel.coords.map(function(c){ return [c[1],c[0]]; }),
      { color:corV, weight:6, opacity:0.9 }).addTo(Viagem.map);
    Viagem.camadas.push(linha);

    Viagem.marcadores.push(L.marker([p.origem.lat,p.origem.lon]).addTo(Viagem.map)
      .bindPopup('<b>Origem</b><br>'+U.esc(p.origem.curto)));
    Viagem.marcadores.push(L.marker([p.destino.lat,p.destino.lon]).addTo(Viagem.map)
      .bindPopup('<b>Destino</b><br>'+U.esc(p.destino.curto)));

    (sel.pontosParada || []).forEach(function (parada, indice) {
      if (!parada.lat || !parada.lon) return;

      var trecho = Viagem.trechoParada(parada);
      var ordem = parada.ordemTrecho || (indice + 1);
      var corParada = (trecho === 'VOLTA') ? '#8b5cf6' : '#22c55e';

      var icone = L.divIcon({
        className:'',
        html:'<div class="marcador-num" style="background:'+corParada+';color:#fff;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.3)">'+ordem+'</div>',
        iconSize:[28,28], iconAnchor:[14,14]
      });

      var rating = Number(parada.postoRating || parada.rating || 0);
      var litros = Number(parada.litrosPrevisto) || 0;
      var valor = Number(parada.valorPrevisto) || 0;

      var latNav = parada.postoLat || parada.lat;
      var lonNav = parada.postoLon || parada.lon;

      var popup = '<b>' + trecho + ' · Parada ' + ordem + '</b>' +
        '<br><b>' + U.esc(Viagem.nomeParada(parada, indice)) + '</b>' +
        '<br>Km ' + U.num(parada.kmNoTrecho || parada.kmAcum || 0, 1) +
        (litros > 0
          ? '<br>Abastecer ' + U.num(litros, 1) + ' L' +
            (valor > 0 ? ' · ' + U.moeda(valor) : '')
          : '') +
        (rating > 0 ? '<br>⭐ ' + U.num(rating, 1) : '') +
        (parada.postoEndereco ? '<br>' + U.esc(parada.postoEndereco) : '') +
        (parada.motivo ? '<br><small>' + U.esc(parada.motivo) + '</small>' : '') +
        '<br>' + linkComoChegar(latNav, lonNav);

      Viagem.marcadores.push(
        L.marker([parada.lat, parada.lon], { icon: icone })
          .addTo(Viagem.map)
          .bindPopup(popup)
      );
    });

    (sel.pontosPedagio||[]).forEach(function (x) {
      if (!x.lat || !x.lon) return;
      var ico = L.divIcon({ className:'', html:'<div class="marcador-ped">P</div>', iconSize:[22,22], iconAnchor:[11,11] });
      Viagem.marcadores.push(L.marker([x.lat,x.lon],{icon:ico}).addTo(Viagem.map)
        .bindPopup('<b>'+U.esc(x.nome||'Pedágio')+'</b>'));
    });

    try { Viagem.map.fitBounds(linha.getBounds(), { padding:[30,30] }); } catch (e) {}

    var textoPedagio = Number(sel.custoPedagio) > 0
      ? U.moeda(sel.custoPedagio) + ' de pedágio'
      : (sel.temPedagio ? 'pedágio com valor indisponível' : 'sem pedágio informado');

    setHTML('tituloMapa',
      '<div class="tm-veic" style="--c:'+corV+'"><span class="ms">'+U.ico(p.veiculoTipo)+'</span>'+U.esc(p.veiculoNome)+'</div>' +
      '<b>'+U.esc(sel.nome)+' · '+U.esc(p.origem.curto)+' → '+U.esc(p.destino.curto)+'</b>' +
      '<small>'+U.num(sel.km,1)+' km · '+U.hm(sel.minutos)+' · '+(sel.qtdParadas||0)+' parada(s) · '+textoPedagio+'</small>');

    setHTML('legendaMapa',
      '<span><i class="dot" style="background:'+corV+'"></i>Rota</span>' +
      '<span><i class="dot" style="background:#64748b"></i>Alternativas</span>' +
      '<span><i class="dot" style="background:#22c55e"></i>Parada na ida</span>' +
      '<span><i class="dot" style="background:#8b5cf6"></i>Parada na volta</span>' +
      '<span><i class="dot" style="background:#f59e0b"></i>Pedágio</span>');
  },

  carregarPostos: function (sel) {
    var alvos = (sel.pontosParada && sel.pontosParada.length) ? sel.pontosParada : (sel.pontosApoio || []);
    if (!alvos.length) return;
    if (Viagem.postosCache[Viagem.rotaSel]) return Viagem.marcarPostos(Viagem.postosCache[Viagem.rotaSel]);
    Viagem.cancelado = false;
    UI.load(true, 'Procurando postos no trajeto…', function () { Viagem.cancelado = true; });
    UI.progresso(alvos.length + ' ponto(s)');
    comPrazo(api('postosNasParadas', alvos, 15000), 50000)
      .then(function (r) {
        if (Viagem.cancelado) return;
        Viagem.postosCache[Viagem.rotaSel] = r || [];
        UI.load(false); Viagem.marcarPostos(r || []);
      })
      .catch(function (e) {
        if (Viagem.cancelado) return;
        UI.load(false);
        UI.toast(e.message || 'Não consegui carregar os postos','erro');
      });
  },

  marcarPostos: function (paradas) {
    var achou = 0, total = 0;
    paradas.forEach(function (p, i) {
      var lista = p.postos || [];
      if (lista.length) { achou++; total += lista.length; }
      lista.forEach(function (x) {
        Viagem.marcadores.push(L.circleMarker([x.lat,x.lon],
          { radius:7, color:'#22c55e', fillColor:'#22c55e', fillOpacity:0.85, weight:2 }).addTo(Viagem.map)
          .bindPopup('<b>'+U.esc(x.nome)+'</b><br>'+U.esc(x.endereco||'') +
            '<br>'+x.desvioKm+' km da parada<br>' + linkComoChegar(x.lat, x.lon)));
      });
    });
    if (total) {
      UI.toast(total+' posto(s) encontrado(s) em '+achou+' ponto(s)','ok');
      Viagem.listarPostosRota(paradas);
    } else {
      UI.toast('Nenhum posto mapeado no trajeto','erro');
    }
  },

  listarPostosRota: function (paradas) {
    var html = '<div class="hub-periodo"><span class="ms">route</span>Postos ao longo do trajeto</div>';
    paradas.forEach(function (p, i) {
      var lista = p.postos || [];
      html += '<h4 class="hub-sec">Parada '+(i+1)+' · km '+U.num(p.kmAcum,1) +
        (lista.length ? ' — '+lista.length+' posto(s)' : ' — nenhum posto') + '</h4>';
      if (!lista.length) {
        html += '<div class="mv-vazio" style="padding:10px 0"><span class="ms">search_off</span>' +
          '<div><small>Nada mapeado num raio de '+(p.raioUsado||15)+' km. Abasteça antes.</small></div></div>';
        return;
      }
      html += '<div class="lista-postos">' + lista.map(function (x, j) {
        var tags = [];
        if (x.h24) tags.push('<span class="pt-tag h24">Aberto agora</span>');
        if (Number(x.rating) > 0) tags.push('<span class="pt-tag">⭐ '+U.num(x.rating,1)+'</span>');
        return '<div class="posto-item"><div class="pi-num">'+(j+1)+'</div>' +
          '<div class="pi-txt"><b>'+U.esc(x.nome)+'</b>' +
          '<small>'+(x.endereco ? U.esc(x.endereco) : 'endereço não informado')+'</small>' +
          (tags.length ? '<div class="pi-tags">'+tags.join('')+'</div>' : '') + '</div>' +
          '<div class="pi-dist"><b>'+x.desvioKm+'</b><small>km</small>' +
          '<a class="pi-ir" href="' + URL_MAPS_DIR + x.lat + ',' + x.lon + '" ' +
          'target="_blank" rel="noopener"><span class="ms">navigation</span></a></div></div>';
      }).join('') + '</div>';
    });
    UI.modal('Postos no trajeto', html, null);
  },

  postosPertoDoCentro: function () {
    Viagem.initMapa();
    if (!Viagem.map) return UI.toast('Mapa não disponível','erro');
    var c = Viagem.map.getCenter();
    Viagem.postosPertoDe(c.lat, c.lng);
  },

  postosPertoDe: function (lat, lon) {
    Viagem.initMapa();
    Viagem.cancelado = false;
    UI.load(true,'Buscando postos…', function () { Viagem.cancelado = true; });
    comPrazo(api('postosProximos', lat, lon, 10000), 45000)
      .then(function (r) {
        if (Viagem.cancelado) return;
        UI.load(false);
        var postos = (r && r.postos) || [];
        var raio = (r && r.raioUsado) || 10;
        if (!postos.length) { UI.toast('Nenhum posto num raio de '+raio+' km','erro'); return; }
        postos.forEach(function (x) {
          Viagem.marcadores.push(L.circleMarker([x.lat,x.lon],
            { radius:8, color:'#22c55e', fillColor:'#22c55e', fillOpacity:0.85, weight:2 }).addTo(Viagem.map)
            .bindPopup('<b>'+U.esc(x.nome)+'</b><br>'+U.esc(x.endereco||'') +
              '<br>'+x.desvioKm+' km<br>' + linkComoChegar(x.lat, x.lon)));
        });
        try {
          var g = L.featureGroup(Viagem.marcadores);
          Viagem.map.fitBounds(g.getBounds(), { padding:[40,40], maxZoom:13 });
        } catch (e) {}
        UI.toast(postos.length+' posto(s) num raio de '+raio+' km','ok');
      })
      .catch(function (e) {
        if (Viagem.cancelado) return;
        UI.load(false); UI.toast(e.message||'Falha ao consultar postos','erro');
      });
  },

  criarViagem: function (i) {
    var p = Viagem.plano, r = p.rotas[i];
    var v = U.veic(p.veiculoId);
    UI.fecharModal();
    var html = '<div class="veic-unico" style="--c:'+U.hex(p.veiculoCor)+'">' +
      '<span class="ms">'+U.ico(p.veiculoTipo)+'</span>' +
      '<div><b>'+U.esc(p.veiculoNome)+'</b><small>veículo da viagem</small></div></div>' +
      '<div class="aviso verde"><span class="ms">check_circle</span><div><b>'+U.esc(r.nome)+
      (p.idaVolta ? ' · ida e volta' : '')+'</b>' +
      U.num(r.km,1)+' km · '+(r.qtdParadas||0)+' parada(s) · previsão de '+U.moeda(r.custoTotal)+'</div></div>' +
      '<div class="form">' +
      campo('Título da viagem','<input id="cTitulo" value="'+U.esc(p.origem.curto+' → '+p.destino.curto)+'">') +
      '<div class="linha2">' +
        campo('Saída','<input id="cIni" type="date" value="'+U.hoje()+'">') +
        campo('Retorno','<input id="cFim" type="date">') + '</div>' +
      campo('KM do painel','<input id="cKm" type="number" inputmode="numeric" value="'+(v?v.kmAtual:'')+'">') +
      '<h4 class="hub-sec">Orçamento previsto</h4>' +
      '<div class="linha2">' +
        campo('Alimentação','<input id="cAlim" type="number" step="0.01" placeholder="0,00">') +
        campo('Hospedagem','<input id="cHosp" type="number" step="0.01" placeholder="0,00">') + '</div>' +
      campo('Outros gastos','<input id="cOutros" type="number" step="0.01" placeholder="0,00">') +
      '<p class="dica">Combustível ('+U.moeda(r.custoCombustivel)+') e pedágio (' +
      U.moeda(r.custoPedagio||0)+') já entram no orçamento.</p>' +
      campo('Observações','<textarea id="cObs"></textarea>') + '</div>';

    UI.modal('Criar viagem', html, function () {
      var alim = UI.n('cAlim'), hosp = UI.n('cHosp'), outros = UI.n('cOutros');
      var pacote = {
        coords:r.coords, km:r.km, minutos:r.minutos,
        origem:p.origem, destino:p.destino,
        pontosParada:r.pontosParada || [], pontosApoio:r.pontosApoio || [],
        autonomia:r.autonomia || null,
        pracas:r.pracas||0,
        temPedagio:r.temPedagio||0,
        custoPedagio:r.custoPedagio||0,
        moedaPedagio:r.moedaPedagio||'BRL',
        pedagioCalculado:1,
        metodoPedagio:r.metodoPedagio||'',
        avisoPedagio:r.avisoPedagio||'',
        pontosPedagio:r.pontosPedagio||[]
      };
      var dados = {
        veiculoId: p.veiculoId, titulo: UI.v('cTitulo'),
        dataInicio: UI.v('cIni'), dataFim: UI.v('cFim'),
        origem: p.origem.curto, destino: p.destino.curto,
        distancia: r.km, kmInicial: UI.n('cKm'),
        combustivelPrev: r.custoCombustivel, pedagioPrev: r.custoPedagio || 0,
        pracas: r.pracas || 0, alimentacaoPrev: alim, hospedagemPrev: hosp, outrosPrev: outros,
        totalPrev: Math.round((r.custoTotal + alim + hosp + outros)*100)/100,
        idaVolta: p.idaVolta === 1, rota: JSON.stringify(pacote), obs: UI.v('cObs')
      };
      function gravar() {
        UI.load(true,'Criando viagem…');
        api('criarViagemDoPlano', dados).then(function (nova) {
          return App.aposSalvar('Viagem criada com rota e paradas!', function () {
            if (nova && nova.id) App.abrirViagem(nova.id); else App.irPara('viagens');
          });
        }).catch(function (e) { UI.load(false); UI.toast(e.message,'erro'); });
      }
      UI.fecharModal();
      App.alertaManutViagem(p.veiculoId, r.km, dados.dataInicio, dados.dataFim, gravar);
    }, 'Criar viagem');
  }
};

/* =====================================================================
   CARWAY v9 - EQUIPE (frontend)

   Cole este bloco no Script.html, imediatamente ANTES da linha:
       /* ---------------- Boot ---------------- *[/]
   ===================================================================== */

App._meuPerfil = null;
App._membros = [];
App._convites = [];

/* ==================== INICIO E CARGA ==================== */

App.iniciar = function () {
  var d = new Date();
  FILTRO.ano = d.getFullYear();
  FILTRO.mes = d.getMonth() + 1;

  return App.carregar(true).then(function () {
    App.irParaMenu();
    return true;
  }).catch(function () { return false; });
};

App.carregar = function (primeira) {
  if (!primeira) UI.load(true, 'Atualizando…');

  return api('carregarApp').then(function (d) {
    if (!d || typeof d !== 'object') {
      throw new Error('O servidor devolveu dados vazios.');
    }

    var base = dbVazio();
    for (var k in base) if (d[k] === undefined || d[k] === null) d[k] = base[k];

    DB = d;
    APP_PRONTO = true;

    if (primeira && DB.hoje) {
      var p = DB.hoje.split('-');
      if (p.length === 3) {
        FILTRO.ano = parseInt(p[0], 10);
        FILTRO.mes = parseInt(p[1], 10);
      }
    }

    App.montarSeletor();
    App.render();
    UI.load(false);
    App.fecharSplash();
    App.checarVersao();
    App.atualizarSininho();

    if (primeira && !DB.veiculos.length) {
      setTimeout(function () { App.formVeiculo(true); }, 600);
    }
    return d;

  }).catch(function (e) {
    UI.load(false);
    App.fecharSplash();

    var msg = e.message || '';

    if (msg.indexOf('SEM_SESSAO') === 0 || msg.indexOf('SESSAO_INVALIDA') === 0) {
      limparSessaoLocal();
      App.telaSemAcesso('SEM_SESSAO', '');
    } else if (msg.indexOf('SEM_CONTA:') === 0) {
      App.telaSemAcesso('SEM_CONTA', msg.substring(10));
    } else if (msg.indexOf('SEM_ORGANIZACAO:') === 0) {
      App.telaSemAcesso('SEM_ORGANIZACAO', msg.substring(16));
    } else if (msg.indexOf('ORGANIZACAO_INATIVA:') === 0) {
      App.telaSemAcesso('ORGANIZACAO_INATIVA', msg.substring(20));
    } else if (msg.indexOf('PLANILHA_NAO_CONFIGURADA') === 0 ||
               msg.indexOf('PLANILHA_SEM_ACESSO') === 0) {
      App.erroFatal(
        'O aplicativo ainda nao foi configurado pelo proprietario. ' +
        'Peca para ele publicar a implantacao com "Executar como: Eu (proprietario)" ' +
        'e "Quem tem acesso: Qualquer pessoa".'
      );
    } else {
      App.erroFatal(msg || 'Falha ao carregar os dados');
    }
    throw e;
  });
};

/* ==================== TELA DE ACESSO PENDENTE ==================== */

App.telaSemAcesso = function (motivo, email) {
  var splash = $('splash');
  if (splash) splash.style.display = 'none';

  var app = $('app');
  if (app) app.innerHTML = '';

  var topbar = $('topbar');
  if (topbar) topbar.classList.add('oculto');

  var barra = $('barraVeiculos');
  if (barra) barra.classList.add('oculto');

  var tab = $('tabbar');
  if (tab) tab.classList.add('oculto');

  var telaAnterior = $('telaSemAcesso');
  if (telaAnterior) telaAnterior.remove();

  var titulo;
  var mensagem;

  if (motivo === 'SEM_SESSAO') {
    titulo = 'Ative seu acesso ao CarWay';
    mensagem =
      'Este aparelho ainda nao esta vinculado a nenhuma conta. ' +
      'Cole abaixo o link que voce recebeu por e-mail ou WhatsApp para ativar. ' +
      'Voce faz isso apenas uma vez neste aparelho.';
  } else if (motivo === 'SEM_CONTA') {
    titulo = 'Voce ainda nao tem acesso ao CarWay';
    mensagem =
      'A Conta do Google <b>' + U.esc(email) + '</b> ainda nao esta cadastrada. ' +
      'Peca para o administrador da familia ou da frota enviar um convite para este mesmo e-mail.';
  } else if (motivo === 'ORGANIZACAO_INATIVA') {
    titulo = 'Acesso temporariamente suspenso';
    mensagem =
      'A organizacao <b>' + U.esc(email) + '</b> esta temporariamente desativada. ' +
      'Fale com o administrador do CarWay para reativar o acesso.';
  } else {
    titulo = 'Sua conta ainda nao esta vinculada a uma equipe';
    mensagem =
      'A conta <b>' + U.esc(email) + '</b> ja existe, mas nao possui vinculo ativo ' +
      'com uma familia ou frota. Use o convite recebido ou solicite um novo ao administrador.';
  }

  var html =
    '<div id="telaSemAcesso" style="position:fixed;inset:0;z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;padding:24px;' +
      'background:var(--bg,#07101f);overflow:auto">' +
      '<div style="width:100%;max-width:560px;padding:34px 28px;text-align:center;' +
        'background:var(--card,#101c31);border:1px solid var(--linha,#263754);' +
        'border-radius:24px;box-shadow:0 24px 70px rgba(0,0,0,.38)">' +
        '<div style="width:96px;height:96px;border-radius:28px;' +
          'background:rgba(59,130,246,.15);display:grid;place-items:center;' +
          'margin:0 auto 24px">' +
          '<span class="ms" style="font-size:50px;color:#60a5fa">' +
          (motivo === 'SEM_SESSAO' ? 'key' : 'group_off') + '</span>' +
        '</div>' +
        '<h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;color:var(--txt,#fff)">' +
          titulo +
        '</h1>' +
        '<p style="color:var(--txt2,#a9b7ce);font-size:16px;line-height:1.7;' +
          'margin:0 auto 26px;max-width:490px">' + mensagem + '</p>' +
        '<div class="form" style="text-align:left;margin-top:8px">' +
          '<div>' +
            '<label>Link ou codigo do convite</label>' +
            '<input id="tokenManual" placeholder="Cole aqui o link recebido">' +
          '</div>' +
        '</div>' +
        '<button class="btn primario bloco-full" style="margin-top:14px;min-height:50px" ' +
          'onclick="App.aplicarConviteManual()">' +
          '<span class="ms">key</span> Ativar acesso' +
        '</button>' +
        '<button class="btn ghost bloco-full" style="margin-top:10px;min-height:48px" ' +
          'onclick="location.reload()">' +
          '<span class="ms">refresh</span> Ja ativei, recarregar' +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', html);
};

/* ==================== APLICAR CONVITE ==================== */

/**
 * Extrai o token de um link colado inteiro ou de um codigo puro.
 */
App.extrairToken = function (valor) {
  var v = String(valor || '').trim();
  if (!v) return '';

  var m = v.match(/[?&](?:convite|sessao)=([A-Za-z0-9]+)/i);
  if (m) return m[1];

  m = v.match(/([A-Za-z0-9]{24,})/);
  if (m) return m[1];

  return v;
};

App.processarConvite = function (token, botao) {
  var textoOriginal = botao ? botao.innerHTML : '';
  if (botao) {
    botao.disabled = true;
    botao.innerHTML = '<i class="mini-loader"></i> Ativando acesso…';
  } else {
    UI.load(true, 'Validando seu convite…');
  }

  var dispositivo = '';
  try { dispositivo = navigator.userAgent || ''; } catch (e) {}

  return api('aceitarConvite', token, dispositivo).then(function (r) {
    UI.load(false);

    if (r && r.sessaoToken) gravarSessaoLocal(r.sessaoToken);

    var tela = $('telaSemAcesso');
    if (tela) tela.remove();

    var telaErro = $('telaErroConvite');
    if (telaErro) telaErro.remove();

    var topbar = $('topbar'); if (topbar) topbar.classList.remove('oculto');
    var tab = $('tabbar'); if (tab) tab.classList.remove('oculto');

    UI.toast(
      r.transferenciaConcluida
        ? 'Nova conta de acesso confirmada com sucesso'
        : 'Bem-vindo(a) à ' + (r.organizacao || 'sua equipe') + '!',
      'ok'
    );

    App.iniciar();

    if (r.tipo === 'NOVO_MEMBRO' || r.tipo === 'FUNDADOR') {
      setTimeout(function () { App.mostrarBoasVindas(r.organizacao); }, 900);
    }
    return true;

  }).catch(function (e) {
    UI.load(false);

    if (botao) {
      botao.disabled = false;
      botao.innerHTML = textoOriginal;
    }

    var mensagem = (e && e.message) ? e.message : 'Nao foi possivel aplicar o convite.';

    if (mensagem.indexOf('PLANILHA_NAO_CONFIGURADA') === 0 ||
        mensagem.indexOf('PLANILHA_SEM_ACESSO') === 0) {
      mensagem =
        'O aplicativo ainda nao foi configurado pelo proprietario. ' +
        'Peca para ele republicar a implantacao com ' +
        '"Executar como: Eu (proprietario)" e "Quem tem acesso: Qualquer pessoa".';
    }

    if (botao) {
      UI.toast(mensagem, 'erro');
    } else if (typeof App.mostrarErroConvite === 'function') {
      App.mostrarErroConvite(mensagem, token);
    } else {
      alert(mensagem);
    }
    return false;
  });
};

App.aplicarConviteManual = function () {
  var valor = UI.v('tokenManual');
  if (!valor) return UI.toast('Cole o link ou o codigo do convite', 'erro');

  var token = App.extrairToken(valor);
  var botao = document.querySelector('#telaSemAcesso button.btn.primario');

  App.processarConvite(token, botao);
};

App.sairDaConta = function () {
  UI.confirmar({
    titulo: 'Sair da conta',
    mensagem: 'Este aparelho deixara de ter acesso ao CarWay. ' +
      'Para voltar, sera preciso usar o link de convite novamente.',
    textoBotao: 'Sair',
    icone: 'logout',
    aoConfirmar: function () {
      var token = CARWAY_SESSAO.token;
      limparSessaoLocal();
      api('encerrarSessao', token).catch(function () {});
      setTimeout(function () { location.reload(); }, 400);
    }
  });
};

App.mostrarBoasVindas = function (nomeOrganizacao) {
  var html =
    '<div style="text-align:center;padding:6px 0 4px">' +
      '<div style="width:84px;height:84px;border-radius:24px;background:rgba(34,197,94,.15);' +
        'display:grid;place-items:center;margin:0 auto 18px">' +
        '<span class="ms" style="font-size:44px;color:#4ade80">waving_hand</span>' +
      '</div>' +
      '<h3 style="margin:0 0 8px;font-size:19px">Bem-vindo(a) ao CarWay!</h3>' +
      '<p style="color:var(--txt2);font-size:13.5px;line-height:1.65;margin:0 auto 4px;max-width:380px">' +
        'Você agora faz parte da equipe' +
        (nomeOrganizacao ? ' <b>' + U.esc(nomeOrganizacao) + '</b>' : '') +
        '. Veja rapidinho como usar:' +
      '</p>' +
    '</div>' +
    '<div class="lista" style="margin-top:14px">' +
      '<div class="item">' +
        '<div class="av azul"><span class="ms">dashboard</span></div>' +
        '<div class="txt"><b>Toque em um atalho</b>' +
        '<small>No Menu, escolha Veículos, Viagens, Abastecimento ou Manutenção para lançar algo rápido.</small></div>' +
      '</div>' +
      '<div class="item">' +
        '<div class="av verde"><span class="ms">swipe</span></div>' +
        '<div class="txt"><b>Use o rodapé para ver detalhes</b>' +
        '<small>Os ícones embaixo da tela mostram o histórico completo de cada área.</small></div>' +
      '</div>' +
      '<div class="item">' +
        '<div class="av roxo"><span class="ms">arrow_back</span></div>' +
        '<div class="txt"><b>Toque no ícone do CarWay para voltar</b>' +
        '<small>No topo da tela, o ícone do carro sempre te leva de volta ao Menu.</small></div>' +
      '</div>' +
    '</div>';

  UI.modal('Como usar o CarWay', html, function () {
    UI.fecharModal();
  }, 'Entendi, vamos lá');
};

/* ---------------- Hub Equipe ---------------- */

App.carregarMeuPerfil = function () {
  return api('meuPerfil').then(function (d) {
    App._meuPerfil = d;
    var sub = $('subPagina');
    return d;
  }).catch(function () { App._meuPerfil = null; });
};

App.hubEquipe = function () {
  UI.load(true, 'Carregando equipe…');

  Promise.all([
    api('listarMembros'),
    api('listarConvites')
  ]).then(function (r) {
    UI.load(false);

    var dm = r[0], dc = r[1];
    App._membros = dm.membros || [];
    App._convites = (dc || []).filter(function (c) { return c.status === 'PENDENTE'; });

    var podeGerenciar = (dm.meuPerfil === 'OWNER' || dm.meuPerfil === 'ADMIN' || dm.meuPerfil === 'ADMIN_MASTER');

    var html = '<div class="hub-periodo"><span class="ms">groups</span>' +
      App._membros.length + ' pessoa(s) na equipe' +
      (App._convites.length ? ' · ' + App._convites.length + ' convite(s) pendente(s)' : '') +
      '</div>';

    html += '<div class="lista">' + App._membros.map(function (m) {
      return App.cardMembro(m, podeGerenciar);
    }).join('') + '</div>';

    if (App._convites.length) {
      html += '<h4 class="hub-sec">Convites pendentes</h4><div class="lista">' +
        App._convites.map(function (c) { return App.cardConvite(c, podeGerenciar); }).join('') +
        '</div>';
    }

    if (podeGerenciar) {
      html += '<div class="acao-topo" style="margin-top:14px">' +
        '<button class="btn primario bloco-full" onclick="App.formConvidar()">' +
        '<span class="ms">person_add</span> Convidar para a equipe</button></div>';
    } else {
      html += '<p class="dica" style="margin-top:12px;text-align:center">' +
        'Apenas administradores podem convidar ou remover pessoas.</p>';
    }

    UI.modal('Equipe', html, null);

  }).catch(function (e) {
    UI.load(false);
    UI.toast(e.message || 'Falha ao carregar a equipe','erro');
  });
};

App.cardMembro = function (m, podeGerenciar) {
  var corPerfil = m.perfil === 'OWNER' || m.perfil === 'ADMIN_MASTER' ? '#a78bfa'
    : (m.perfil === 'ADMIN' ? '#3b82f6' : '#94a3b8');

  var rotuloPerfil = {
    OWNER: 'Proprietário', ADMIN_MASTER: 'Proprietário', ADMIN: 'Administrador',
    MEMBRO: 'Membro', LEITOR: 'Leitor'
  }[m.perfil] || m.perfil;

  var acoes = '';
  if (podeGerenciar && !m.souEu && m.perfil !== 'OWNER' && m.perfil !== 'ADMIN_MASTER') {
    acoes = '<div class="acoes-item">' +
      '<button onclick="App.alterarPerfilUI(\''+m.id+'\',\''+U.esc(m.nome)+'\',\''+m.perfil+'\')">' +
      '<span class="ms">admin_panel_settings</span> Alterar perfil</button>' +
      '<button onclick="App.removerMembroUI(\''+m.id+'\',\''+U.esc(m.nome)+'\')">' +
      '<span class="ms">person_remove</span> Remover</button>' +
      '</div>';
  }

  return '<div class="item" style="--c:'+corPerfil+'">' +
    '<div class="av" style="background:'+corPerfil+'22;color:'+corPerfil+'">' +
    '<span class="ms">'+(m.souEu ? 'account_circle' : 'person')+'</span></div>' +
    '<div class="txt"><b>'+U.esc(m.nome)+(m.souEu ? ' (você)' : '')+'</b>' +
    '<small>'+U.esc(m.email)+'</small>' +
    '<span class="tag" style="background:'+corPerfil+'22;color:'+corPerfil+';border-color:transparent">' +
    rotuloPerfil+'</span>' +
    acoes +
    '</div></div>';
};

App.cardConvite = function (convite, podeGerenciar) {
  var transferencia =
    String(convite.tipo || '').toUpperCase() === 'TRANSFERENCIA_EMAIL';

  var detalhes = [];

  if (transferencia && convite.emailAnterior) {
    detalhes.push(U.esc(convite.emailAnterior) + ' → ' + U.esc(convite.email));
  } else {
    if (convite.email) detalhes.push(U.esc(convite.email));
    if (convite.telefone) detalhes.push(U.esc(convite.telefone));
  }

  var acoes = podeGerenciar
    ? '<div class="acoes-item">' +
        '<button onclick="App.reenviarConviteUI(\'' + convite.id + '\')">' +
          '<span class="ms">send</span> Reenviar' +
        '</button>' +
        '<button onclick="App.cancelarConviteUI(\'' + convite.id + '\')">' +
          '<span class="ms">close</span> Cancelar' +
        '</button>' +
      '</div>'
    : '';

  return (
    '<div class="item">' +
      '<div class="av amarelo">' +
        '<span class="ms">' + (transferencia ? 'forward_to_inbox' : 'mail') + '</span>' +
      '</div>' +
      '<div class="txt">' +
        '<b>' +
          U.esc(convite.nome || convite.email) +
        '</b>' +
        (detalhes.length ? '<small>' + detalhes.join(' · ') + '</small>' : '') +
        '<small>Solicitado em ' + U.data(convite.criadoEm) + '</small>' +
        '<span class="tag atencao">' +
          (transferencia ? 'Transferência aguardando confirmação' : 'Aguardando resposta') +
        '</span>' +
        acoes +
      '</div>' +
    '</div>'
  );
};

App.formConvidar = function () {
  var html =
    '<div class="aviso info">' +
      '<span class="ms">person_add</span>' +
      '<div>' +
        '<b>Convidar para a equipe</b>' +
        'A pessoa receberá um e-mail com o link de acesso. ' +
        'O convite precisa ser aceito usando a mesma Conta do Google informada.' +
      '</div>' +
    '</div>' +
    '<div class="form">' +
      campo(
        'Nome completo',
        '<input id="cvNome" ' +
          'autocomplete="name" ' +
          'placeholder="Nome da pessoa">'
      ) +
      campo(
        'Telefone',
        '<input id="cvTelefone" ' +
          'type="tel" ' +
          'inputmode="tel" ' +
          'autocomplete="tel" ' +
          'placeholder="(61) 99999-9999">'
      ) +
      campo(
        'E-mail da Conta do Google',
        '<input id="cvEmail" ' +
          'type="email" ' +
          'autocomplete="email" ' +
          'placeholder="pessoa@gmail.com">'
      ) +
      campo(
        'Perfil',
        '<select id="cvPerfil">' +
          '<option value="MEMBRO" selected>' +
            'Membro - pode lançar e editar' +
          '</option>' +
          '<option value="ADMIN">' +
            'Administrador - também gerencia pessoas' +
          '</option>' +
          '<option value="LEITOR">' +
            'Leitor - somente visualiza' +
          '</option>' +
        '</select>'
      ) +
    '</div>';

  UI.modal(
    'Convidar pessoa',
    html,
    function () {
      var dados = {
        nome: UI.v('cvNome').trim(),
        telefone: UI.v('cvTelefone').trim(),
        email: UI.v('cvEmail').trim().toLowerCase(),
        perfil: UI.v('cvPerfil')
      };

      if (!dados.nome) {
        UI.toast(
          'Informe o nome da pessoa',
          'erro'
        );

        return;
      }

      if (
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(
          dados.email
        )
      ) {
        UI.toast(
          'Informe um e-mail válido',
          'erro'
        );

        return;
      }

      UI.fecharModal();

      UI.load(
        true,
        'Enviando convite...'
      );

      api(
        'convidarMembro',
        dados
      ).then(function (resultado) {
        UI.load(false);

        UI.toast(
          'Convite enviado para ' +
            resultado.nome,
          'ok'
        );

        App.hubEquipe();
      }).catch(function (erro) {
        UI.load(false);

        UI.toast(
          erro.message,
          'erro'
        );
      });
    },
    'Enviar convite'
  );
};


App.alterarPerfilUI = function (membroId) {
  var membro = null;

  for (var i = 0; i < App._membros.length; i++) {
    if (String(App._membros[i].id) === String(membroId)) {
      membro = App._membros[i];
      break;
    }
  }

  if (!membro) {
    UI.toast('Membro não encontrado', 'erro');
    return;
  }

  var html =
    '<div class="aviso info">' +
      '<span class="ms">manage_accounts</span>' +
      '<div>' +
        '<b>Editar pessoa</b>' +
        'Nome, telefone e perfil são atualizados imediatamente.' +
      '</div>' +
    '</div>' +
    '<div class="form">' +
      campo(
        'Nome completo',
        '<input id="emNome" autocomplete="name" value="' + U.esc(membro.nome || '') + '">'
      ) +
      campo(
        'Telefone',
        '<input id="emTelefone" type="tel" inputmode="tel" autocomplete="tel" value="' +
          U.esc(membro.telefone || '') + '">'
      ) +
      campo(
        'Conta do Google atual',
        '<input id="emEmail" type="email" value="' +
          U.esc(membro.email || '') + '" readonly>'
      ) +
      '<button type="button" class="btn ghost bloco-full" ' +
        'onclick="UI.fecharModal();App.formTransferirEmail(\'' + membro.id + '\')">' +
        '<span class="ms">forward_to_inbox</span> Transferir conta de acesso' +
      '</button>' +
      campo(
        'Perfil',
        '<select id="emPerfil">' +
          '<option value="MEMBRO"' + (membro.perfil === 'MEMBRO' ? ' selected' : '') +
            '>Membro - pode lançar e editar</option>' +
          '<option value="ADMIN"' + (membro.perfil === 'ADMIN' ? ' selected' : '') +
            '>Administrador - também gerencia pessoas</option>' +
          '<option value="LEITOR"' + (membro.perfil === 'LEITOR' ? ' selected' : '') +
            '>Leitor - somente visualiza</option>' +
        '</select>'
      ) +
    '</div>';

  UI.modal(
    'Editar membro',
    html,
    function () {
      var dados = {
        nome: UI.v('emNome'),
        telefone: UI.v('emTelefone'),
        perfil: UI.v('emPerfil')
      };

      if (!dados.nome) {
        return UI.toast('Informe o nome da pessoa', 'erro');
      }

      UI.fecharModal();
      UI.load(true, 'Atualizando membro...');

      api('alterarPerfilMembro', membroId, dados).then(function () {
        UI.load(false);
        UI.toast('Dados e perfil atualizados', 'ok');
        App.hubEquipe();
      }).catch(function (erro) {
        UI.load(false);
        UI.toast(erro.message, 'erro');
      });
    },
    'Salvar alterações'
  );
};

App.formTransferirEmail = function (membroId) {
  var membro = null;

  for (var i = 0; i < App._membros.length; i++) {
    if (String(App._membros[i].id) === String(membroId)) {
      membro = App._membros[i];
      break;
    }
  }

  if (!membro) {
    UI.toast('Membro não encontrado', 'erro');
    return;
  }

  var html =
    '<div class="aviso">' +
      '<span class="ms">security</span>' +
      '<div>' +
        '<b>Transferência protegida</b>' +
        'A conta atual continuará com acesso até a nova Conta do Google confirmar o convite.' +
      '</div>' +
    '</div>' +
    '<div class="form">' +
      campo(
        'Conta atual',
        '<input value="' + U.esc(membro.email || '') + '" readonly>'
      ) +
      campo(
        'Nova Conta do Google',
        '<input id="teEmail" type="email" autocomplete="email" placeholder="novoemail@gmail.com">'
      ) +
      campo(
        'Confirme o novo e-mail',
        '<input id="teEmailConfirmacao" type="email" autocomplete="off" placeholder="Digite novamente">'
      ) +
    '</div>';

  UI.modal(
    'Transferir conta de acesso',
    html,
    function () {
      var novoEmail = UI.v('teEmail').trim().toLowerCase();
      var confirmacao = UI.v('teEmailConfirmacao').trim().toLowerCase();

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novoEmail)) {
        return UI.toast('Informe um novo e-mail válido', 'erro');
      }

      if (novoEmail !== confirmacao) {
        return UI.toast('Os dois e-mails não conferem', 'erro');
      }

      if (novoEmail === String(membro.email || '').toLowerCase()) {
        return UI.toast('O novo e-mail é igual ao e-mail atual', 'erro');
      }

      UI.fecharModal();
      UI.load(true, 'Enviando confirmação...');

      api('solicitarTransferenciaEmail', membroId, novoEmail).then(function (resultado) {
        UI.load(false);
        UI.toast(
          'Confirmação enviada para ' + resultado.novoEmail,
          'ok'
        );
        App.hubEquipe();
      }).catch(function (erro) {
        UI.load(false);
        UI.toast(erro.message, 'erro');
      });
    },
    'Enviar confirmação'
  );
};

App.removerMembroUI = function (membroId, nome) {
  UI.confirmar({
    titulo: 'Remover da equipe',
    mensagem: '<b>' + U.esc(nome) + '</b> será removido(a) da equipe e perderá o acesso imediatamente. ' +
      'Os lançamentos já feitos por essa pessoa continuam no histórico.',
    textoBotao: 'Remover',
    icone: 'person_remove',
    aoConfirmar: function () {
      UI.load(true,'Removendo…');
      api('removerMembro', membroId).then(function () {
        UI.load(false);
        UI.toast(nome + ' removido(a) da equipe','ok');
        App.hubEquipe();
      }).catch(function (e) {
        UI.load(false); UI.toast(e.message,'erro');
      });
    }
  });
};

App.cancelarConviteUI = function (id) {
  UI.confirmar({
    titulo: 'Cancelar convite',
    mensagem: 'Este convite será cancelado e o link enviado por e-mail deixará de funcionar.',
    textoBotao: 'Cancelar convite',
    icone: 'close',
    aoConfirmar: function () {
      api('cancelarConvite', id).then(function () {
        UI.toast('Convite cancelado','ok');
        App.hubEquipe();
      }).catch(function (e) { UI.toast(e.message,'erro'); });
    }
  });
};

App.reenviarConviteUI = function (id) {
  UI.load(true,'Reenviando…');

  api('reenviarConvite', id).then(function () {
    UI.load(false);
    UI.toast('Convite reenviado','ok');
  }).catch(function (e) {
    UI.load(false); UI.toast(e.message,'erro');
  });
};

/* =====================================================================
   CARWAY v9 - TELA MENU (atalhos rapidos)
   COMPORTAMENTO:
   - O Menu passa a ser a tela inicial (troca App.iniciar).
   - So o Menu esconde a tabbar. Todas as outras paginas mostram
     a tabbar completa (5 abas), inclusive quando voce ja esta
     naquela pagina - a aba correspondente so fica sem grifo,
     nao desaparece.
   - Nenhuma funcao existente (formVeiculo, formAbastecimento,
     formManutencao, formDespesa, abrirPlanejador, etc.) e alterada.
     O Menu apenas CHAMA essas funcoes que ja existem.
   ===================================================================== */

App.irParaMenu = function () {
  PAGINA = 'menu';
  App.atualizarBotaoVoltar();

  [].forEach.call(document.querySelectorAll('.pagina'), function (e) {
    e.classList.remove('ativa');
  });

  var pg = $('pg-menu');
  if (pg) pg.classList.add('ativa');

  var tab = $('tabbar');
  if (tab) tab.classList.add('oculto');

  [].forEach.call(document.querySelectorAll('.tab'), function (e) {
    e.classList.remove('ativa');
    e.classList.remove('oculto');
  });

  var topbar = $('topbar');
  if (topbar) topbar.classList.remove('oculto');

  setTexto('tituloPagina', 'CarWay');
  setTexto('subPagina', 'Menu');

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

App.voltarTopo = function () {
  UI.fecharModal();

  if (PAGINA === 'menu') {
    return;
  }

  if (PAGINA === 'viagem') {
    VIAGEM_ABERTA = null;
    App.irPara('viagens');
    return;
  }

  App.irParaMenu();
};

App.atualizarBotaoVoltar = function () {
  var btn = $('btnVoltarTopo');
  if (!btn) return;
  btn.classList.toggle('oculto', PAGINA === 'menu');
};

App._mostrarTabbarSeNecessario = function () {
  var tab = $('tabbar');
  if (tab) tab.classList.remove('oculto');
};

App.abrirViagensMenu = function () {
  var html =
    '<div class="menu-acoes">' +
      '<button class="menu-acao" onclick="UI.fecharModal();Viagem.abrirPlanejador()">' +
        '<span class="ms">explore</span>' +
        '<div><b>Planejar viagem</b><small>Rota, autonomia e paradas com o Google Maps</small></div>' +
        '<span class="ms seta">chevron_right</span>' +
      '</button>' +
      '<button class="menu-acao" onclick="UI.fecharModal();App.formViagemManual()">' +
        '<span class="ms">edit_note</span>' +
        '<div><b>Registrar manual</b><small>Para uma viagem que já foi feita</small></div>' +
        '<span class="ms seta">chevron_right</span>' +
      '</button>' +
      '<button class="menu-acao" onclick="UI.fecharModal();Viagem.abrirBuscaPostos()">' +
        '<span class="ms">travel_explore</span>' +
        '<div><b>Buscar postos</b><small>Num raio à sua escolha</small></div>' +
        '<span class="ms seta">chevron_right</span>' +
      '</button>' +
    '</div>';

  UI.modal('Viagens', html, null);
};

App.abrirAbastecimentoMenu = function () {
  var html =
    '<div class="menu-acoes">' +
      '<button class="menu-acao" onclick="UI.fecharModal();App.formAbastecimento()">' +
        '<span class="ms">local_gas_station</span>' +
        '<div><b>Novo abastecimento</b><small>Lançar litros, preço e posto</small></div>' +
        '<span class="ms seta">chevron_right</span>' +
      '</button>' +
      '<button class="menu-acao" onclick="UI.fecharModal();Viagem.abrirBuscaPostos()">' +
        '<span class="ms">travel_explore</span>' +
        '<div><b>Buscar postos</b><small>Num raio à sua escolha</small></div>' +
        '<span class="ms seta">chevron_right</span>' +
      '</button>' +
    '</div>';

  UI.modal('Abastecimento', html, null);
};

App.renderMenu = function () {
  if (!temEl('menuCards')) return;
  var cards =
    App.cartaoMenu('dashboard', 'dashboard', 'Painel', 'Resumo dos gastos', 'azul') +
    App.cartaoMenu('veiculo', 'directions_car', 'Veículos', 'toque para cadastrar', 'verde') +
    App.cartaoMenu('viagem', 'luggage', 'Viagens', 'planejar, registrar, postos', 'roxo') +
    App.cartaoMenu('abastecimento', 'local_gas_station', 'Abastecimento', 'toque para lançar', 'ciano') +
    App.cartaoMenu('manutencao', 'build', 'Manutenção', 'toque para lançar', 'amarelo') +
    App.cartaoMenu('despesa', 'receipt_long', 'Despesas', 'toque para lançar', 'vermelho');

  if (DB.ehMaster) {
    cards += App.cartaoMenu('configuracoes', 'admin_panel_settings', 'Configurações', 'gerenciar organizações', 'cinza');
  }

  setHTML('menuCards', cards);
};

App._organizacoesMaster = [];

App.abrirConfiguracoesMaster = function () {
  UI.load(true, 'Carregando painel de controle…');
  api('listarOrganizacoesMaster').then(function (lista) {
    UI.load(false);
    App._organizacoesMaster = lista || [];
    App.renderPainelMaster();
  }).catch(function (e) {
    UI.load(false);
    UI.toast(e.message || 'Falha ao carregar organizações', 'erro');
  });
};

App.renderPainelMaster = function () {
  var lista = App._organizacoesMaster || [];
  var ativas = lista.filter(function (o) { return String(o.status).toUpperCase() === 'ATIVO'; });
  var inativas = lista.filter(function (o) { return String(o.status).toUpperCase() !== 'ATIVO'; });
  var totalUsuarios = 0, totalVeiculos = 0;
  lista.forEach(function (o) { totalUsuarios += o.membrosAtivos; totalVeiculos += o.veiculosAtivos; });

  var html = '<div class="painel-master-topo">' +
    '<span class="ms">admin_panel_settings</span>' +
    '<div style="font-size:13px;color:var(--txt2)">Painel do administrador</div>' +
    '</div>';

  html += '<div class="hub-resumo" style="margin-bottom:14px">' +
    '<div class="hr-item"><b>' + lista.length + '</b><small>organizações</small></div>' +
    '<div class="hr-item v"><b>' + ativas.length + '</b><small>ativas</small></div>' +
    '<div class="hr-item r"><b>' + inativas.length + '</b><small>inativas</small></div>' +
    '</div>';

  if (ativas.length || inativas.length) {
    var itensGrafico = [];
    if (ativas.length) itensGrafico.push(['Ativas', ativas.length, '#22c55e', 'check_circle']);
    if (inativas.length) itensGrafico.push(['Inativas', inativas.length, '#ef4444', 'block']);
    html += '<div class="rosca" style="margin-bottom:10px">' +
      App.rosca(itensGrafico, lista.length) + '</div>';
    html += '<div class="hub-resumo" style="margin-bottom:18px">' +
      '<div class="hr-item"><b>' + totalUsuarios + '</b><small>usuários no total</small></div>' +
      '<div class="hr-item"><b>' + totalVeiculos + '</b><small>veículos no total</small></div>' +
      '</div>';
  }

  html += '<h4 class="hub-sec">Organizações</h4>';

  if (!lista.length) {
    html += UI.vazio('business', 'Nenhuma organização criada ainda.');
  } else {
    if (ativas.length) {
      html += '<h4 class="hub-sec v" style="margin-top:6px">Ativas (' + ativas.length + ')</h4>' +
        ativas.map(App.cardOrganizacaoMaster).join('');
    }
    if (inativas.length) {
      html += '<h4 class="hub-sec r" style="margin-top:16px">Desativadas (' + inativas.length + ')</h4>' +
        inativas.map(App.cardOrganizacaoMaster).join('');
    }
  }

  html += '<div class="acao-topo" style="margin-top:18px">' +
    '<button class="btn destaque bloco-full" onclick="App.formCriarOrganizacao()">' +
    '<span class="ms">add_business</span> Criar nova organização</button></div>';

  UI.modal('Configurações', html, null);
};

/* ==================== CARTAO DA ORGANIZACAO (substitui o antigo) ==================== */

App.cardOrganizacaoMaster = function (org) {
  var ativa = String(org.status).toUpperCase() === 'ATIVO';
  var textoBotao = ativa ? 'Desativar organização' : 'Ativar organização';
  var icone = ativa ? 'block' : 'check_circle';
  var classeBotao = ativa ? 'desativar' : 'ativar';

  var lotadoUsuarios = org.maxUsuarios > 0 && org.membrosAtivos >= org.maxUsuarios;
  var lotadoVeiculos = org.maxVeiculos > 0 && org.veiculosAtivos >= org.maxVeiculos;

  return '<div class="org-card' + (ativa ? '' : ' inativa') + '">' +
    '<div class="org-card-topo">' +
      '<div class="org-card-ico"><span class="ms">business</span></div>' +
      '<div class="org-card-id"><b>' + U.esc(org.nome) + '</b>' +
      '<small>' + U.esc(org.planoNome) + '</small></div>' +
      '<span class="org-badge ' + (ativa ? 'ativa' : 'inativa') + '">' +
      (ativa ? 'Ativa' : 'Inativa') + '</span>' +
    '</div>' +
    '<div class="org-card-stats">' +
      '<div class="org-stat"' + (lotadoUsuarios ? ' style="outline:1px solid #f59e0b"' : '') + '>' +
      '<b>' + org.membrosAtivos + '/' + org.maxUsuarios + '</b><small>usuários</small></div>' +
      '<div class="org-stat"' + (lotadoVeiculos ? ' style="outline:1px solid #f59e0b"' : '') + '>' +
      '<b>' + org.veiculosAtivos + '/' + org.maxVeiculos + '</b><small>veículos</small></div>' +
    '</div>' +
    (lotadoUsuarios || lotadoVeiculos
      ? '<p class="dica" style="margin:-4px 0 10px;color:#fcd34d">' +
        '<span class="ms" style="font-size:14px;vertical-align:middle">warning</span> ' +
        'Plano no limite' +
        (lotadoUsuarios && lotadoVeiculos
          ? ' de usuários e veículos'
          : (lotadoUsuarios ? ' de usuários' : ' de veículos')) +
        '.</p>'
      : '') +
    '<button class="org-toggle-btn" style="background:rgba(59,130,246,.14);color:#60a5fa;margin-bottom:8px" ' +
      'onclick="App.abrirTrocaPlano(\'' + org.id + '\')">' +
      '<span class="ms">workspace_premium</span> Alterar plano' +
    '</button>' +
    '<button class="org-toggle-btn ' + classeBotao + '" ' +
      'onclick="App.alternarStatusOrgMaster(\'' + org.id + '\')">' +
      '<span class="ms">' + icone + '</span> ' + textoBotao +
    '</button>' +
  '</div>';
};

/* ==================== TROCA DE PLANO ==================== */

App._planosMaster = null;
App._planoTrocaSelecionado = '';

App.abrirTrocaPlano = function (organizacaoId) {
  UI.load(true, 'Carregando planos…');

  api('listarPlanosMaster', organizacaoId).then(function (d) {
    UI.load(false);
    App._planosMaster = d;
    App._planoTrocaSelecionado = d.planoAtual;
    App.renderTrocaPlano();
  }).catch(function (e) {
    UI.load(false);
    UI.toast(e.message || 'Falha ao carregar os planos', 'erro');
  });
};

App.renderTrocaPlano = function () {
  var d = App._planosMaster;
  if (!d) return;

  var uso = d.uso;

  var html =
    '<div class="veic-unico" style="--c:#a78bfa">' +
      '<span class="ms">business</span>' +
      '<div><b>' + U.esc(d.nomeOrganizacao) + '</b>' +
      '<small>Plano atual: ' + U.esc(
        (App._planosMaster.planos.filter(function (p) { return p.atual; })[0] || {}).nome ||
        d.planoAtual
      ) + '</small></div>' +
    '</div>';

  html += '<div class="hub-resumo" style="margin-bottom:14px">' +
    '<div class="hr-item"><b>' + uso.usuariosAtivos + '/' + uso.maxUsuarios + '</b>' +
    '<small>usuários ativos</small></div>' +
    '<div class="hr-item"><b>' + uso.veiculosAtivos + '/' + uso.maxVeiculos + '</b>' +
    '<small>veículos</small></div>' +
    '</div>';

  if (uso.convitesPendentes > 0) {
    html += '<div class="aviso info"><span class="ms">mail</span><div>' +
      '<b>' + uso.convitesPendentes + ' convite(s) pendente(s)</b>' +
      'Convites já ocupam vaga no plano. Total considerado: ' +
      uso.ocupacaoUsuarios + ' usuário(s).</div></div>';
  }

  html += '<h4 class="hub-sec">Escolha o novo plano</h4>';

  html += '<div class="plano-org-cards" id="planoTrocaCards">' +
    d.planos.map(function (p) {
      var selecionado = (p.codigo === App._planoTrocaSelecionado);
      var bloqueado = !p.permitido;

      var estilo = bloqueado
        ? ' style="opacity:.45;cursor:not-allowed"'
        : '';

      var clique = bloqueado
        ? ''
        : ' onclick="App.selPlanoTroca(this)"';

      return '<div class="plano-org-card' + (selecionado ? ' sel' : '') + '" ' +
        'data-plano="' + p.codigo + '" data-permitido="' + p.permitido + '"' +
        estilo + clique + '>' +
        '<span class="ms">' + p.icone + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<b>' + U.esc(p.nome) +
          (p.atual ? ' <span class="tag ok" style="margin-left:4px">atual</span>' : '') +
          '</b>' +
          '<small>' + p.maxUsuarios + ' usuário(s) · ' + p.maxVeiculos + ' veículo(s)' +
          (p.descricao ? ' · ' + U.esc(p.descricao) : '') + '</small>' +
          (bloqueado
            ? '<small style="color:#fca5a5">' + U.esc(p.impedimento) + '</small>'
            : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';

  html += '<p class="dica" style="margin-top:12px">' +
    'Planos que não comportam o uso atual ficam desativados. ' +
    'Nenhum dado é apagado por causa de troca de plano — para reduzir, ' +
    'remova membros ou veículos antes.</p>';

  UI.modal('Plano da organização', html, function () {
    App.confirmarTrocaPlano();
  }, 'Aplicar plano');
};

App.selPlanoTroca = function (el) {
  if (el.getAttribute('data-permitido') !== '1') return;

  [].forEach.call(document.querySelectorAll('#planoTrocaCards .plano-org-card'), function (c) {
    c.classList.remove('sel');
  });
  el.classList.add('sel');

  App._planoTrocaSelecionado = el.getAttribute('data-plano');
};

App.confirmarTrocaPlano = function () {
  var d = App._planosMaster;
  if (!d) return;

  var codigo = App._planoTrocaSelecionado;

  if (!codigo) {
    return UI.toast('Escolha um plano', 'erro');
  }

  if (codigo === d.planoAtual) {
    return UI.toast('Esta organização já está neste plano', 'erro');
  }

  var escolhido = d.planos.filter(function (p) { return p.codigo === codigo; })[0];
  if (!escolhido) return UI.toast('Plano inválido', 'erro');

  var atual = d.planos.filter(function (p) { return p.atual; })[0] || {};
  var reducao =
    escolhido.maxUsuarios < (atual.maxUsuarios || 0) ||
    escolhido.maxVeiculos < (atual.maxVeiculos || 0);

  UI.fecharModal();

  UI.confirmar({
    titulo: reducao ? 'Reduzir o plano' : 'Alterar o plano',
    mensagem:
      '<b>' + U.esc(d.nomeOrganizacao) + '</b> passará de ' +
      '<b>' + U.esc(atual.nome || d.planoAtual) + '</b> para ' +
      '<b>' + U.esc(escolhido.nome) + '</b>.<br><br>' +
      'Novos limites: ' + escolhido.maxUsuarios + ' usuário(s) e ' +
      escolhido.maxVeiculos + ' veículo(s).' +
      (reducao
        ? '<br><br>Os dados já lançados continuam intactos. A organização apenas ' +
          'não poderá cadastrar novos usuários ou veículos acima do novo limite.'
        : ''),
    textoBotao: reducao ? 'Reduzir plano' : 'Aplicar plano',
    icone: reducao ? 'trending_down' : 'workspace_premium',
    aoConfirmar: function () {
      UI.load(true, 'Alterando plano…');

      api('alterarPlanoOrganizacaoMaster', d.organizacaoId, codigo).then(function (r) {
        UI.load(false);
        UI.toast(
          U.esc(r.nomeOrganizacao) + ' agora é ' + r.planoNome +
          ' (' + r.maxUsuarios + ' usuários · ' + r.maxVeiculos + ' veículos)',
          'ok'
        );
        App.abrirConfiguracoesMaster();
      }).catch(function (e) {
        UI.load(false);
        UI.toast(e.message, 'erro');
      });
    }
  });
};

App.alternarStatusOrgMaster = function (id) {
  var org = null;
  for (var i = 0; i < App._organizacoesMaster.length; i++) {
    if (String(App._organizacoesMaster[i].id) === String(id)) { org = App._organizacoesMaster[i]; break; }
  }
  if (!org) return;

  var ativa = String(org.status).toUpperCase() === 'ATIVO';
  var novoStatus = ativa ? 'INATIVO' : 'ATIVO';

  UI.confirmar({
    titulo: ativa ? 'Desativar organização' : 'Ativar organização',
    mensagem: ativa
      ? 'Os membros de "' + U.esc(org.nome) + '" perderão o acesso ao CarWay até a organização ser reativada.'
      : '"' + U.esc(org.nome) + '" voltará a funcionar normalmente para seus membros.',
    textoBotao: ativa ? 'Desativar' : 'Ativar',
    icone: ativa ? 'block' : 'check_circle',
    aoConfirmar: function () {
      UI.load(true, ativa ? 'Desativando…' : 'Ativando…');
      api('alternarStatusOrganizacaoMaster', id, novoStatus).then(function () {
        UI.load(false);
        UI.toast('Organização ' + (ativa ? 'desativada' : 'ativada'), 'ok');
        App.abrirConfiguracoesMaster();
      }).catch(function (e) {
        UI.load(false);
        UI.toast(e.message, 'erro');
      });
    }
  });
};

App._planoSelecionado = 'FAMILIAR';

App.formCriarOrganizacao = function () {
  App._planoSelecionado = 'FAMILIAR';

  var planos = [
    ['FREE', 'person', 'Free', '1 usuário · 1 veículo'],
    ['FAMILIAR', 'family_restroom', 'Familiar', '3 usuários · 2 veículos'],
    ['FAMILIAR_PREMIUM', 'star', 'Familiar Premium', '5 usuários · 3 veículos'],
    ['FROTA', 'local_shipping', 'Frota', '12 usuários · 10 veículos'],
    ['FROTA_PREMIUM', 'workspace_premium', 'Frota Premium', '25 usuários · 20 veículos']
  ];

  var cardsPlano = planos.map(function (p) {
    return '<div class="plano-org-card' + (p[0] === App._planoSelecionado ? ' sel' : '') + '" ' +
      'data-plano="' + p[0] + '" onclick="App.selPlanoOrg(this)">' +
      '<span class="ms">' + p[1] + '</span>' +
      '<div><b>' + p[2] + '</b><small>' + p[3] + '</small></div>' +
      '</div>';
  }).join('');

  var html =
    '<div class="painel-master-topo">' +
    '<span class="ms">add_business</span>' +
    '<div style="font-size:13px;color:var(--txt2)">A pessoa receberá um convite para ativar<br>' +
    'a própria organização, já como proprietária.</div>' +
    '</div>' +
    '<div class="form">' +
    campo('Nome da organização', '<input id="orgNome" placeholder="Ex.: Transportes Vagner">') +
    '<div><label>Plano</label><div class="plano-org-cards" id="planoOrgCards">' + cardsPlano + '</div>' +
    '<input type="hidden" id="orgPlano" value="' + App._planoSelecionado + '"></div>' +
    campo('Nome do responsável', '<input id="orgDono" placeholder="Nome completo">') +
    campo('Telefone (com DDD)', '<input id="orgTelefone" type="tel" placeholder="61999999999">') +
    campo('E-mail da Conta do Google', '<input id="orgEmail" type="email" placeholder="pessoa@gmail.com">') +
    '</div>';

  UI.modal('Nova organização', html, function () {
    var dados = {
      nomeOrganizacao: UI.v('orgNome'),
      tipoPlano: UI.v('orgPlano'),
      nomeDono: UI.v('orgDono'),
      telefoneDono: UI.v('orgTelefone'),
      emailDono: UI.v('orgEmail')
    };
    if (!dados.nomeOrganizacao) return UI.toast('Informe o nome da organização', 'erro');
    if (!dados.nomeDono) return UI.toast('Informe o nome do responsável', 'erro');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.emailDono)) return UI.toast('Informe um e-mail válido', 'erro');

    UI.fecharModal();
    UI.load(true, 'Criando organização…');
    api('criarOrganizacaoMaster', dados).then(function (r) {
      UI.load(false);
      App.mostrarLinkOrganizacao(r);
    }).catch(function (e) {
      UI.load(false);
      UI.toast(e.message, 'erro');
    });
  }, 'Criar e enviar convite');
};

App.selPlanoOrg = function (el) {
  [].forEach.call(document.querySelectorAll('#planoOrgCards .plano-org-card'), function (c) {
    c.classList.remove('sel');
  });
  el.classList.add('sel');
  var f = $('orgPlano');
  if (f) f.value = el.getAttribute('data-plano');
};

App.mostrarLinkOrganizacao = function (r) {
  var iconeWhatsapp =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="flex:none">' +
      '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.004c5.46 0 9.91-4.45 9.91-9.91C21.98 6.45 17.53 2 12.04 2zm0 18.15h-.003a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.55-3.7 8.24-8.25 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.48-1.39-1.73-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.42-.14-.01-.31-.01-.48-.01s-.43.06-.66.31c-.23.25-.86.85-.86 2.07s.89 2.4 1.01 2.57c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.28z"/>' +
    '</svg>';

  var linkAbertura = '<a href="' + r.linkWhatsapp + '" target="_blank" rel="noopener" ' +
    'style="text-decoration:none;background:#25D366;color:#fff;border-radius:12px;' +
    'padding:12px 15px;margin-top:8px;display:flex;align-items:center;' +
    'justify-content:center;gap:8px;font-weight:600;font-size:13.5px">';

  var botaoWhatsapp = r.linkWhatsapp
    ? linkAbertura + iconeWhatsapp + ' Enviar pelo WhatsApp</a>'
    : '<p class="dica" style="margin-top:8px">Informe o telefone do responsável para gerar o link direto do WhatsApp.</p>';

  var html =
    '<div class="aviso verde"><span class="ms">check_circle</span><div>' +
    '<b>Organização "' + U.esc(r.nomeOrganizacao) + '" criada!</b>' +
    'O e-mail já foi enviado automaticamente. Você também pode compartilhar o link diretamente.' +
    '</div></div>' +
    '<div class="form">' +
    campo('Link do convite', '<input id="linkGerado" value="' + U.esc(r.linkConvite) + '" readonly>') +
    '<button type="button" class="btn ghost bloco-full" onclick="App.copiarLinkOrg()">' +
    '<span class="ms">content_copy</span> Copiar link</button>' +
    botaoWhatsapp +
    '</div>';

  UI.modal('Convite pronto', html, function () {
    UI.fecharModal();
    App.abrirConfiguracoesMaster();
  }, 'Concluir');
};

App.copiarLinkOrg = function () {
  var campo = $('linkGerado');
  if (!campo) return;
  campo.select();
  campo.setSelectionRange(0, 99999);
  try {
    document.execCommand('copy');
    UI.toast('Link copiado', 'ok');
  } catch (e) {
    UI.toast('Não foi possível copiar automaticamente. Selecione e copie manualmente.', 'erro');
  }
};

App.cartaoMenu = function (acao, ico, titulo, sub, cor) {
  return '<button class="menu-card ' + cor + '" onclick="App.acionarMenu(\'' + acao + '\')">' +
    '<span class="ms">' + ico + '</span>' +
    '<b>' + titulo + '</b>' +
    '<small>' + sub + '</small>' +
    '</button>';
};

App.acionarMenu = function (acao) {
  App._mostrarTabbarSeNecessario();
  if (acao === 'dashboard') { App.irPara('dashboard'); return; }
  if (acao === 'veiculo') { App.formVeiculo(); return; }
  if (acao === 'viagem') { App.abrirViagensMenu(); return; }
  if (acao === 'abastecimento') { App.abrirAbastecimentoMenu(); return; }
  if (acao === 'manutencao') { App.formManutencao(); return; }
  if (acao === 'despesa') { App.formDespesa(); return; }
  if (acao === 'configuracoes') { App.abrirConfiguracoesMaster(); return; }
};

/* =====================================================================
   CARWAY v9 - ALTERNAR MODO CLARO/ESCURO
 ===================================================================== */

App.aplicarTemaSalvo = function () {
  var salvo = 'escuro';
  try { salvo = localStorage.getItem('carway_tema') || 'escuro'; } catch (e) {}

  document.body.classList.toggle('tema-claro', salvo === 'claro');

  var btn = $('temaIcone');
  if (btn) btn.textContent = (salvo === 'claro') ? 'dark_mode' : 'light_mode';
};

App.alternarTema = function () {
  var claroAgora = document.body.classList.contains('tema-claro');
  var novo = claroAgora ? 'escuro' : 'claro';

  document.body.classList.toggle('tema-claro', novo === 'claro');

  try { localStorage.setItem('carway_tema', novo); } catch (e) {}

  var btn = $('temaIcone');
  if (btn) btn.textContent = (novo === 'claro') ? 'dark_mode' : 'light_mode';

  UI.toast(novo === 'claro' ? 'Modo claro ativado' : 'Modo escuro ativado', 'ok');
};

App.mostrarErroConvite = function (
  mensagem,
  token
) {
  var splash = $('splash');

  if (splash) {
    splash.style.display = 'none';
  }

  var topbar = $('topbar');

  if (topbar) {
    topbar.classList.add('oculto');
  }

  var barra = $('barraVeiculos');

  if (barra) {
    barra.classList.add('oculto');
  }

  var tabbar = $('tabbar');

  if (tabbar) {
    tabbar.classList.add('oculto');
  }

  var telaAnterior =
    $('telaErroConvite');

  if (telaAnterior) {
    telaAnterior.remove();
  }

  var html =
    '<div id="telaErroConvite" ' +
      'style="' +
        'position:fixed;' +
        'inset:0;' +
        'z-index:99999;' +
        'display:flex;' +
        'align-items:center;' +
        'justify-content:center;' +
        'padding:24px;' +
        'background:var(--fundo,#07101f);' +
        'overflow:auto;' +
      '">' +
      '<div style="' +
        'width:100%;' +
        'max-width:580px;' +
        'padding:34px 28px;' +
        'text-align:center;' +
        'background:var(--card,#101c31);' +
        'border:1px solid var(--linha,#263754);' +
        'border-radius:24px;' +
        'box-shadow:0 24px 70px rgba(0,0,0,.38);' +
      '">' +
        '<div style="' +
          'width:96px;' +
          'height:96px;' +
          'border-radius:28px;' +
          'background:rgba(239,68,68,.14);' +
          'display:grid;' +
          'place-items:center;' +
          'margin:0 auto 24px;' +
        '">' +
          '<span class="ms" style="' +
            'font-size:50px;' +
            'color:#f87171;' +
          '">' +
            'link_off' +
          '</span>' +
        '</div>' +

        '<h1 style="' +
          'margin:0 0 14px;' +
          'font-size:26px;' +
          'line-height:1.2;' +
          'color:var(--txt,#fff);' +
        '">' +
          'Não foi possível aplicar o convite' +
        '</h1>' +

        '<p style="' +
          'color:var(--txt2,#a9b7ce);' +
          'font-size:16px;' +
          'line-height:1.7;' +
          'margin:0 auto 20px;' +
          'max-width:500px;' +
        '">' +
          U.esc(mensagem) +
        '</p>' +

        '<div style="' +
          'padding:14px 16px;' +
          'border-radius:14px;' +
          'background:rgba(59,130,246,.1);' +
          'color:var(--txt2,#a9b7ce);' +
          'font-size:13px;' +
          'line-height:1.6;' +
          'text-align:left;' +
          'margin-bottom:20px;' +
        '">' +
          '<b style="color:var(--txt,#fff)">' +
            'Conta identificada' +
          '</b>' +
          '<br>' +
          'Confira se a Conta do Google aberta é a mesma ' +
          'para a qual o convite foi enviado.' +
        '</div>' +

        '<button class="btn primario bloco-full" ' +
          'style="min-height:50px" ' +
          'onclick="location.reload()">' +
          '<span class="ms">refresh</span>' +
          ' Tentar novamente' +
        '</button>' +

        '<button class="btn ghost bloco-full" ' +
          'style="margin-top:10px;min-height:48px" ' +
          'onclick="' +
            'var tela=document.getElementById(\'telaErroConvite\');' +
            'if(tela)tela.remove();' +
            'App.telaSemAcesso(\'SEM_CONTA\',\'\');' +
          '">' +
          '<span class="ms">key</span>' +
          ' Inserir outro convite' +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.insertAdjacentHTML(
    'beforeend',
    html
  );
};

/* =====================================================================
   CARWAY — MÓDULO OFFLINE (Fase 1)
   Estrutura base: detecção de estado, banner e armazenamento local.
   Ainda NÃO enfileira nada — só prepara a infraestrutura.
   ===================================================================== */

var Offline = {
  _chavePendentes: 'carway_pendentes_v1',
  _chaveCache: 'carway_cache_v1',
  _chaveUltimoSync: 'carway_ultimo_sync_v1',
  _online: true,
  _pendentes: [],
  _intervalo: null,

  // ---------- Inicialização ----------
iniciar: function () {
Offline._online = navigator.onLine;

window.addEventListener('online', Offline.aoVoltarOnline);
window.addEventListener('offline', Offline.aoFicarOffline);

Offline._pendentes = Offline._lerPendentes();

Offline._intervalo = setInterval(Offline.verificarEstado, 30000);

setTimeout(Offline.verificarEstado, 800);
},

aoVoltarOnline: function () {
Offline.verificarEstado();
if (Offline._pendentes.length) {
setTimeout(Offline.sincronizarPendentes, 1200);
 }
},

aoFicarOffline: function () {
Offline.verificarEstado();
},

verificarEstado: function () {
Offline._online = navigator.onLine;
Offline.atualizarBanner();
},

  // ---------- Banner ----------
  atualizarBanner: function () {
    var banner = $('bannerOffline');
    if (!banner) return;

    var temPendentes = Offline._pendentes.length > 0;
    var temFalhas = Offline._pendentes.some(function (p) { return p.estado === 'falha'; });
    var online = navigator.onLine;

    // Caso 1: online e sem pendentes → esconde
    if (online && !temPendentes) {
      banner.classList.remove('visivel');
      banner.classList.add('oculto');
      document.body.classList.remove('com-banner-offline');
      return;
    }

    banner.classList.remove('oculto');
    setTimeout(function () { banner.classList.add('visivel'); }, 30);
    document.body.classList.add('com-banner-offline');

    var icone = $('boIcone');
    var titulo = $('boTitulo');
    var sub = $('boSub');
    var badge = $('boPendentes');

    banner.classList.remove('estado-offline','estado-pendente','estado-sincronizando','estado-erro','estado-ok');

    if (temFalhas) {
      banner.classList.add('estado-erro');
      if (icone) icone.textContent = 'error';
      if (titulo) titulo.textContent = 'Falha ao sincronizar';
      if (sub) sub.textContent = 'Toque para ver os lançamentos que falharam';
    } else if (temPendentes) {
      banner.classList.add('estado-pendente');
      if (icone) icone.textContent = 'cloud_upload';
      if (titulo) titulo.textContent = 'Pendentes para enviar';
      if (sub) sub.textContent = Offline._pendentes.length +
        ' lançamento(s) — toque para ver ou sincronizar';
    } else {
      // Offline puro, sem pendentes
      banner.classList.add('estado-offline');
      if (icone) icone.textContent = 'cloud_off';
      if (titulo) titulo.textContent = 'Offline';
      if (sub) sub.textContent = 'Você pode lançar abastecimento, despesa e manutenção';
    }

    if (badge) {
      if (Offline._pendentes.length) {
        badge.classList.remove('oculto');
        badge.textContent = Offline._pendentes.length;
      } else {
        badge.classList.add('oculto');
      }
    }
  },

  // ---------- Armazenamento local ----------
  _lerPendentes: function () {
    try {
      var txt = localStorage.getItem(Offline._chavePendentes);
      if (!txt) return [];
      var lista = JSON.parse(txt);
      return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
  },

  _gravarPendentes: function () {
    try {
      localStorage.setItem(Offline._chavePendentes, JSON.stringify(Offline._pendentes));
    } catch (e) {}
  },

  // ---------- Tela do sincronizador ----------
  abrirSincronizador: function () {
    var tela = $('sincronizador');
    if (!tela) return;
    tela.classList.remove('oculto');
    Offline.renderSincronizador();
  },

  fecharSincronizador: function () {
    var tela = $('sincronizador');
    if (tela) tela.classList.add('oculto');
  },

  renderSincronizador: function () {
    var lista = $('sincLista');
    var titulo = $('sincTitulo');
    if (!lista) return;

    if (!Offline._pendentes.length) {
      if (titulo) titulo.textContent = 'Pendentes';
      lista.innerHTML =
        '<div class="sinc-vazio">' +
        '<span class="ms">check_circle</span>' +
        'Tudo sincronizado!' +
        '</div>';
      return;
    }

    if (titulo) titulo.textContent = Offline._pendentes.length + ' pendente(s)';

    lista.innerHTML = Offline._pendentes.map(function (p) {
      var icone = Offline._iconeTabela(p.tabela);
      var titulo = p.resumo || p.tabela;
      var hora = Offline._horaBonita(p.criadoEm);
      var estado = p.estado === 'falha' ? 'falha' : 'pendente';

      var acoes = p.estado === 'falha'
        ? '<div class="sinc-acoes-falha">' +
          '<button onclick="Offline.tentarDeNovo(\''+p.id+'\')">Tentar de novo</button>' +
          '<button onclick="Offline.exportarItem(\''+p.id+'\')">Exportar</button>' +
          '<button onclick="Offline.removerItem(\''+p.id+'\')">Descartar</button>' +
          '</div>'
        : '';

      return '<div class="sinc-item ' + estado + '">' +
        '<span class="ms">' + icone + '</span>' +
        '<div class="sinc-txt">' +
          '<b>' + U.esc(titulo) + '</b>' +
          (p.erro ? '<small style="color:#fca5a5">' + U.esc(p.erro) + '</small>' : '') +
          '<div class="sinc-hora">' + hora + '</div>' +
          acoes +
        '</div>' +
      '</div>';
    }).join('');
  },

  _iconeTabela: function (t) {
    return ({
      'Abastecimentos': 'local_gas_station',
      'Despesas': 'receipt_long',
      'Manutencoes': 'build'
    })[t] || 'cloud_upload';
  },

  _horaBonita: function (iso) {
    try {
      var d = new Date(iso);
      var agora = new Date();
      var dif = Math.floor((agora - d) / 1000);
      if (dif < 60) return 'há ' + dif + ' segundo(s)';
      if (dif < 3600) return 'há ' + Math.floor(dif/60) + ' minuto(s)';
      if (dif < 86400) return 'há ' + Math.floor(dif/3600) + ' hora(s)';
      return d.toLocaleString('pt-BR');
    } catch (e) { return iso; }
  },

  // ---------- Sincronização (stub — Fase 2 completa) ----------
  sincronizarPendentes: function () {
    // Implementação completa virá na Fase 2.
    // Por enquanto, apenas verifica se há pendentes e avisa.
    if (!Offline._pendentes.length) return;
    if (!navigator.onLine) {
      UI.toast('Sem internet — vou tentar quando a conexão voltar','erro');
      return;
    }
    UI.toast('Sincronização será ativada na próxima atualização','ok');
  },

  // Ações de gerenciamento
  limparTudo: function () {
    if (!Offline._pendentes.length) return;
    if (!confirm('Descartar TODOS os lançamentos pendentes? Isso não pode ser desfeito.')) return;
    Offline._pendentes = [];
    Offline._gravarPendentes();
    Offline.atualizarBanner();
    Offline.renderSincronizador();
  },

  tentarDeNovo: function (id) {
    var p = Offline._pendentes.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    p.estado = 'pendente';
    p.erro = '';
    Offline._gravarPendentes();
    Offline.renderSincronizador();
    Offline.sincronizarPendentes();
  },

  removerItem: function (id) {
    Offline._pendentes = Offline._pendentes.filter(function (x) { return x.id !== id; });
    Offline._gravarPendentes();
    Offline.atualizarBanner();
    Offline.renderSincronizador();
  },

  exportarItem: function (id) {
    var p = Offline._pendentes.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var texto = JSON.stringify(p, null, 2);
    var blob = new Blob([texto], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'carway-' + p.tabela + '-' + id + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    UI.toast('Arquivo salvo','ok');
  }
};

 

