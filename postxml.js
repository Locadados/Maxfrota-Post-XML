var fs = require('fs');
var xml2js = require('xml2js');
var chokidar = require('chokidar');
var parseString = xml2js.parseString;
var parser = new xml2js.Parser();
var builder = new xml2js.Builder();
var request = require('request');
var config = require('./config.json');
var pkg = require('./package.json');
var path = require('path');
var http = require('http');
var moment = require('moment');
var csvjson = require('csvjson');
var _ = require('lodash');
var mkdirp = require('mkdirp');
var headers = {
    'User-Agent': 'Super Agent/0.0.1',
    'Content-Type': 'application/xml'
}
var options = {
    url: config.url,
    method: 'POST',
    headers: headers,
    body: ''
}
var num_xml_processados = 0;
var falhas = 0;
var sucessos = 0;
var startedAt = moment().format('YYYY-MM-DD HH:mm:ss');

//Cria os Diretórios de Monitoramento Caso Não Existam
mkdirp.sync(config.diretorio_observado);
mkdirp.sync(config.diretorio_destino);
mkdirp.sync(config.diretorio_destino+'/sucesso');
mkdirp.sync(config.diretorio_destino+'/falhas');
mkdirp.sync(config.diretorio_destino+'/logs');

function watchDir() {
    chokidar.watch(config.diretorio_observado, {
        ignored: /[\/\\]\./,
        persistent: true,
        ignoreInitial: false
    }).on('add', filepath => {
        if (fs.statSync(filepath).size > 0) {
          num_xml_processados++;
          try {
              catchFile(filepath);
          } catch(e) {
                if (config.modo_depuracao) {
                    //console.log(e.message);
                }
              moveFileToFailDir(e.message, filepath);
          }
        }
    }).on('change', filepath => {
        if (fs.statSync(filepath).size > 0) {
          num_xml_processados++;
          try {
              catchFile(filepath);
          } catch(e) {
                if (config.modo_depuracao) {
                    //console.log(e.message);
                }
              moveFileToFailDir(e.message, filepath);
          }
        }
    });
}
function catchFile(filePath) {
    var fileExtension = path.extname(filePath);
    if (fileExtension.toLowerCase() == '.csv' || fileExtension.toLowerCase() == '.txt') {
        processCsvTxt(filePath);
    } else if (fileExtension.toLowerCase() == '.xml') {
        processXml(filePath);
    }
}

function processCsvTxt(filePath) {
    fs.readFile(filePath,'utf8', (err, data) => {
        var opts = {
              delimiter : ';',
              headers : 'none'
            };
        try {
        var csv = csvjson.toArray(data, opts);
        var xml = buildEntregasXmlFromCsv(csv);
            options.body = xml.replace(/^[\r\n\t ]+|[\r\n\t ]+$/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/ ?([\r\n]) ?/g, '$1');
            options.body = options.body.replace(/(?:\r\n|\r|\n)/g, '');
            if (config.modo_depuracao) {
                //console.log(options.body);
            }
            request(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                if (config.modo_depuracao) {
                    //console.log(response);
                }
                    parseString(body, {
                        ignoreAttrs: true,
                        explicitRoot: false
                    }, (err, xmlResponse) => {
                        if (err) {
                            falhas++;
                            moveFileToFailDir(body, filePath);
                        } else {
                            if (xmlResponse.sucesso) {
                                if(xmlResponse.sucesso[0] == 'nao'){
                                    falhas++;
                                    moveFileToFailDir(body, filePath);
                                }else {
                                    sucessos++;
                                    moveFileToSuccessDir(filePath);
                                }
                            } else {
                                falhas++;
                                moveFileToFailDir(body, filePath);
                            }
                        }
                    });
                } else {
                    falhas++;
                    if (config.modo_depuracao) {
                        //console.log(error.message);
                    }
                    moveFileToFailDir(error.message, filePath);
                }

            });
        }catch(e) {
            falhas++;
            if (config.modo_depuracao) {
                //console.log(e);
            }
            moveFileToFailDir(e.message, filePath);
        }



    });
}
function processXml(filePath) {

    fs.readFile(filePath,'utf8', (err, data) => {
        parseString(data, {
            ignoreAttrs: true,
            explicitRoot: false
        }, (err, xmlJson) => {
            if(err){
                falhas++;
                if (config.modo_depuracao) {
                    console.log(err);
                }
                moveFileToFailDir(err.message, filePath);

            } else {
                try {
                    var dadoEntrega = setuptEntrega(xmlJson);
                    var xml = buildEntregaXml(dadoEntrega);
                    options.body = xml.replace(/^[\r\n\t ]+|[\r\n\t ]+$/g, '')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/ ?([\r\n]) ?/g, '$1');
                    options.body = options.body.replace(/(?:\r\n|\r|\n)/g, '');
                    request(options, function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            if (config.modo_depuracao) {
                                //console.log(response);
                            }
                            parseString(body, {
                                ignoreAttrs: true,
                                explicitRoot: false
                            }, (err, xmlResponse) => {
                                if (err) {
                                    falhas++;
                                    moveFileToFailDir(body, filePath);
                                } else {
                                    if (xmlResponse.sucesso) {
                                        if(xmlResponse.sucesso[0] == 'nao'){
                                            falhas++;
                                            moveFileToFailDir(body, filePath);
                                        }else {
                                            sucessos++;
                                            moveFileToSuccessDir(filePath);
                                        }
                                    } else {
                                        falhas++;
                                        moveFileToFailDir(body, filePath);
                                    }
                                }
                            });
                        } else {
                            falhas++;
                            if (config.modo_depuracao) {
                                //console.log(error.message);
                            }
                            moveFileToFailDir(error.message, filePath);
                        }

                    });
                }catch(e) {
                    falhas++;
                    if (config.modo_depuracao) {
                      console.log(e);
                    }
                    moveFileToFailDir(e.message, filePath);
                }
            }
        });
    });
}

function moveFileToSuccessDir(filePath) {
    fs.rename(filePath, config.diretorio_destino+"/sucesso"+"/"+path.basename(filePath), (err) => {
        if(err) {
            if (config.modo_depuracao) {
                console.log(err);
            }
        }
    });
}
function moveFileToFailDir(msg, filePath) {
    fs.rename(filePath, config.diretorio_destino+"/falhas"+"/"+path.basename(filePath), (err) => {
        if (config.modo_depuracao) {
            console.log(err);
        }
        writeFailLog(msg,filePath);
    });
}
function writeFailLog(msg,filePath) {
    fs.writeFile(config.diretorio_destino+"/logs"+"/"+path.basename(filePath, '.xml')+".log", msg, (err) => {
        if (config.modo_depuracao) {
            console.log(err);
        }
    });
}

function setuptEntrega(xmlJson) {
    var entrega = {};
    var protNFe = {};
    if (xmlJson.protNFe) {
      protNFe = xmlJson.protNFe[0];
    }
    if (xmlJson.NFe) {
      xmlJson = xmlJson.NFe[0];
    }
    entrega.usuario  =  config.usuario;
    entrega.chave  =  config.chave;
    entrega.acao =  'adicionar';
    entrega.origem = {
        codigo_externo: config.origem
    };

    entrega.lote = _.get(xmlJson, 'infNFe[0].ide[0].nNF[0]', '');
    entrega.nota_fiscal = _.get(xmlJson, 'infNFe[0].ide[0].nNF[0]', '');
    entrega.numero = _.get(xmlJson, 'infNFe[0].det[0].prod[0].xPed[0]', _.get(xmlJson, 'infNFe[0].ide[0].nNF[0]', ''));
    entrega.data_emissao = moment(_.get(xmlJson, 'infNFe[0].ide[0].dhEmi[0]', '')).format('YYYY-MM-DD HH:mm:ss');
    entrega.chave_nota_fiscal = _.get(protNFe, 'infProt[0].chNFe[0]', '');
    entrega.valor = _.get(xmlJson, 'infNFe[0].total[0].ICMSTot[0].vNF[0]', '');
    entrega.cliente = {};
    entrega.cliente.codigo = _.get(xmlJson, 'infNFe[0].dest[0].CNPJ[0]', _.get(xmlJson, 'infNFe[0].dest[0].CPF[0]', ''));
    entrega.cliente.nome = _.get(xmlJson, 'infNFe[0].dest[0].xNome[0]', '');
    entrega.cliente.endereco = '';
    entrega.cliente.endereco += _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].xLgr[0]', '');
    entrega.cliente.endereco += _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].nro[0]', '');
    entrega.cliente.endereco += _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].xBairro[0]', '');
    entrega.cliente.endereco += _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].xMun[0]', '');
    entrega.cliente.endereco += _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].UF[0]', '');
    entrega.cliente.endereco_detalhado = {};
    entrega.cliente.endereco_detalhado.logradouro = _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].xLgr[0]', '');
    entrega.cliente.endereco_detalhado.numero = _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].nro[0]', '');
    entrega.cliente.endereco_detalhado.bairro = _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].xBairro[0]', '');
    entrega.cliente.endereco_detalhado.cidade = _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].xMun[0]', '');
    entrega.cliente.endereco_detalhado.uf = _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].UF[0]', '');
    entrega.cliente.endereco_detalhado.cep = _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].CEP[0]', '');
    entrega.cliente.endereco_detalhado.informacoes = "";
    entrega.cliente.telefone = _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].fone[0]', '');
    entrega.cliente.email = "";
    entrega.cliente.cidade = _.get(xmlJson, 'infNFe[0].dest[0].enderDest[0].xMun[0]', '');
    entrega.cliente.latitude = 0;
    entrega.cliente.longitude = 0;

    entrega.janela = {
        data_hora_inicial: "",
        data_hora_final: ""
    },
    entrega.tempo_estimado = "";
    entrega.data_limite = moment(entrega.data_emissao).add(config.dias_para_entrega,'days').format('YYYY-MM-DD');
    entrega.hora_limite = config.hora_limite;
    entrega.tolerancia = 0;
    entrega.posicao = 1;
    entrega.veiculo = {
        codigo_externo: config.veiculo
    },
    entrega.motorista = {
        nome: "",
        cpf: ""
    },
    entrega.rota = {
        codigo_externo: config.rota
    },
    entrega.peso = _.get(xmlJson, 'infNFe[0].transp[0].vol[0].pesoL[0]', '');
    entrega.volume = _.get(xmlJson, 'infNFe[0].transp[0].vol[0].qVol[0]', '');
    entrega.itens = [];


    _.get(xmlJson, 'infNFe[0].det', []).forEach((item, index)=>{
        var itm = {
            codigo_externo: item.prod[0].cProd[0]
        }
        entrega.itens.push(itm);
    });

    return entrega;
}
function buildEntregaXml(entregaJson) {
    var xml = `
    <?xml version="1.0" encoding="utf-8"?>
    <maxfrota>
    <usuario>${entregaJson.usuario}</usuario>
    <chave>${entregaJson.chave}</chave>
    <opcoes>
        <reordenar_entregas>0</reordenar_entregas>
    </opcoes>
    <acao>adicionar</acao>
    <dados>
        <entregas>
            <entrega>
                <origem>
                    <codigo></codigo>
                    <codigo_externo>${entregaJson.origem.codigo_externo}</codigo_externo>
                </origem>
                <lote>${entregaJson.lote}</lote>
                <numero>${entregaJson.numero}</numero>
                <nota_fiscal>${entregaJson.nota_fiscal}</nota_fiscal>
                <data_emissao>${entregaJson.data_emissao}</data_emissao>
                <chave_nota_fiscal>${entregaJson.chave_nota_fiscal}</chave_nota_fiscal>
                <valor>${entregaJson.valor}</valor>
                <cliente>
                    <codigo>${entregaJson.cliente.codigo}</codigo>
                    <nome>${entregaJson.cliente.nome}</nome>
                    <endereco>${entregaJson.cliente.endereco}</endereco>
                    <endereco_detalhado>
                        <logradouro>${entregaJson.cliente.endereco_detalhado.logradouro}</logradouro>
                        <numero>${entregaJson.cliente.endereco_detalhado.numero}</numero>
                        <bairro>${entregaJson.cliente.endereco_detalhado.bairro}</bairro>
                        <cidade>${entregaJson.cliente.endereco_detalhado.cidade}</cidade>
                        <uf>${entregaJson.cliente.endereco_detalhado.uf}</uf>
                        <cep>${entregaJson.cliente.endereco_detalhado.cep}</cep>
                        <informacao_adicional></informacao_adicional>
                    </endereco_detalhado>
                    <telefone>${entregaJson.cliente.telefone}</telefone>
                    <email>${entregaJson.cliente.email}</email>
                    <cidade>${entregaJson.cliente.cidade}</cidade>
                    <latitude>${entregaJson.cliente.latitude}</latitude>
                    <longitude>${entregaJson.cliente.longitude}</longitude>
                </cliente>
                <janela>
                    <data_hora_inicial>${entregaJson.janela.data_hora_inicial}</data_hora_inicial>
                    <data_hora_final>${entregaJson.janela.data_hora_final}</data_hora_final>
                </janela>
                <tempo_estimado>${entregaJson.tempo_estimado}</tempo_estimado>
                <data_limite>${entregaJson.data_limite}</data_limite>
                <hora_limite>${entregaJson.hora_limite}</hora_limite>
                <tolerancia>${entregaJson.tolerancia}</tolerancia>
                <posicao>${entregaJson.posicao}</posicao>
                <veiculo>
                    <codigo></codigo>
                    <codigo_externo>${entregaJson.veiculo.codigo_externo}</codigo_externo>
                </veiculo>
                <motorista>
                    <nome>${entregaJson.motorista.nome}</nome>
                    <cpf>${entregaJson.motorista.cpf}</cpf>
                </motorista>
                <rota>
                    <codigo></codigo>
                    <codigo_externo>${entregaJson.rota.codigo_externo}</codigo_externo>
                </rota>
                <peso>${entregaJson.peso}</peso>
                <volume>${entregaJson.volume}</volume>

                <itens>
                `;
                entregaJson.itens.forEach((item, index) => {

                    xml += ` <item>
                        <codigo_externo>${item.codigo_externo}</codigo_externo>
                    </item>
                    `;
                });
                xml += `
                </itens>
            </entrega>
        </entregas>
    </dados>
</maxfrota>`;
    if (config.modo_depuracao) {
      console.log(xml)
    }
    return xml;
}


function buildEntregasXmlFromCsv(entregaJson) {
    var xml = `
    <?xml version="1.0" encoding="utf-8"?>
    <maxfrota>
    <usuario>${config.usuario}</usuario>
    <chave>${config.chave}</chave>
    <opcoes>
        <reordenar_entregas>0</reordenar_entregas>
    </opcoes>
    <acao>adicionar</acao>
    <dados>
        <entregas>`;
    entregaJson.forEach((entrega, index) => {
        if (config.cabecalho_csv){
            index_val = 1;
        }else{
            index_val = 0;
        }
        if (index >= index_val) {
            var data_limite = moment(entrega[1]).add(config.dias_para_entrega,'days').format('YYYY-MM-DD');
            xml+=`
            <entrega>
                <origem>
                    <codigo></codigo>
                    <codigo_externo>${config.origem}</codigo_externo>
                </origem>
                `;
                if(entrega[27]){
                    xml += `<lote>${entrega[27]}</lote>`;
                }else{
                    xml += `<lote>${entrega[0]}</lote>`;
                }
                xml += `
                <numero>${entrega[0]}</numero>
                <nota_fiscal>${entrega[2]}</nota_fiscal>
                <data_emissao>${entrega[3]}</data_emissao>
                <chave_nota_fiscal>${entrega[4]}</chave_nota_fiscal>
                <valor>${entrega[5]}</valor>
                <cliente>
                    <codigo>${entrega[6]}</codigo>
                    <nome>${entrega[7]}</nome>
                    <endereco>${entrega[8]}</endereco>
                    <endereco_detalhado>
                        <logradouro>${entrega[8]}</logradouro>
                        <numero>${entrega[9]}</numero>
                        <bairro>${entrega[10]}</bairro>
                        <cidade>${entrega[11]}</cidade>
                        <uf>${entrega[12]}</uf>
                        <cep>${entrega[13]}</cep>
                        <informacao_adicional>${entrega[14]}</informacao_adicional>
                    </endereco_detalhado>
                    <telefone>${entrega[15]}</telefone>
                    <email>${entrega[16]}</email>
                    <cidade>${entrega[11]}</cidade>
                    <latitude>${entrega[17]}</latitude>
                    <longitude>${entrega[18]}</longitude>
                </cliente>
                <janela>
                    <data_hora_inicial>${entrega[19]}</data_hora_inicial>
                    <data_hora_final>${entrega[20]}</data_hora_final>
                </janela>
                <tempo_estimado>${entrega[21]}</tempo_estimado>
                <data_limite>${data_limite}</data_limite>
                <hora_limite>${config.hora_limite}</hora_limite>
                <tolerancia></tolerancia>
                <posicao>1</posicao>
                <veiculo>
                    <codigo></codigo>
                    <codigo_externo>${entrega[22]}</codigo_externo>
                </veiculo>
                <motorista>
                    <nome></nome>
                    <cpf></cpf>
                </motorista>
                <rota>
                    <codigo></codigo>
                    <codigo_externo>${entrega[23]}</codigo_externo>
                </rota>
                <peso>${entrega[24]}</peso>
                <volume>${entrega[25]}</volume>`;
                var items = entrega[26].split("|");
                if (items[0]!=''){
                    xml += `
                    <itens>
                    `;

                    items.forEach((item, index) => {
                        xml += ` <item>
                            <codigo_externo>${item}</codigo_externo>
                        </item>
                        `;
                    });
                    xml += `
                    </itens>
                    `;
                }
                xml += `
            </entrega>
            `;
        }
    });
    xml+=`
        </entregas>
    </dados>
</maxfrota>`;
    if (config.modo_depuracao) {
      console.log(xml)
    }
    return xml;
}

console.log("Maxfrota Post XML versão "+pkg.version);
if (config.modo_depuracao) {
  console.log("[Dados de configuração]");
  for (var prop in config) {
    if (config.hasOwnProperty(prop)) {
      console.log(prop + ': '+ config[prop]);
    }
  }
}
var xmlStatusServer = http.createServer((req, res) => {
    res.writeHead(200, {"Content-Type": "text/xml"});
    var xmlStatus = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><status><iniciado>'+startedAt+'</iniciado><tempo_de_atividade>'+process.uptime()+'</tempo_de_atividade><num_xml_processados>'+num_xml_processados+'</num_xml_processados><sucessos>'+sucessos+'</sucessos><falhas>'+falhas+'</falhas></status>';
    res.end(xmlStatus);
}).listen(config.porta_status);
watchDir();
console.log("[Para ver o Status Acesse: http://localhost:"+config.porta_status+"]");
