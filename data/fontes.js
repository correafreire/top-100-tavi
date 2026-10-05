// Rankings buscados na internet em tempo real (Wikipédia / Wikidata) e guardados em cache por 30 dias.
// Formato: [tema, título, 'wiki', idioma, página] ou [tema, título, 'sparql', chave]
module.exports = [
  ['filmes', 'TOP 100 FILMES COM MAIOR BILHETERIA DE TODOS OS TEMPOS', 'sparql', 'bilheteria'],
  ['filmes', 'TOP 100 ANIMAÇÕES COM MAIOR BILHETERIA DE TODOS OS TEMPOS', 'sparql', 'bilheteria_animacao'],
  ['filmes', 'TOP 100 MELHORES FILMES DE TODOS OS TEMPOS SEGUNDO O AFI (AMERICAN FILM INSTITUTE)', 'wiki', 'en', "AFI's 100 Years...100 Movies"],
  ['filmes', 'TOP 100 MELHORES COMÉDIAS DE TODOS OS TEMPOS SEGUNDO O AFI', 'wiki', 'en', "AFI's 100 Years...100 Laughs"],
  ['filmes', 'TOP 100 FILMES DE SUSPENSE E TERROR MAIS EMOCIONANTES SEGUNDO O AFI', 'wiki', 'en', "AFI's 100 Years...100 Thrills"],
  ['filmes', 'TOP 100 MELHORES FILMES DE ROMANCE SEGUNDO O AFI', 'wiki', 'en', "AFI's 100 Years...100 Passions"],
  ['filmes', 'TOP 100 FILMES MAIS INSPIRADORES SEGUNDO O AFI', 'wiki', 'en', "AFI's 100 Years...100 Cheers"],
  ['musica', 'TOP 100 MELHORES MÚSICAS DE FILMES AMERICANOS SEGUNDO O AFI', 'wiki', 'en', "AFI's 100 Years...100 Songs"],
  ['games', 'TOP 100 JOGOS MAIS VENDIDOS DE TODOS OS TEMPOS', 'sparql', 'jogos_vendas'],
  ['games', 'TOP 100 JOGOS MAIS VENDIDOS DO PLAYSTATION 2', 'wiki', 'en', 'List of best-selling PlayStation 2 games'],
  ['internet', 'TOP 100 CANAIS DO YOUTUBE COM MAIS INSCRITOS', 'wiki', 'en', 'List of most-subscribed YouTube channels'],
  ['brasil', 'TOP 100 CIDADES BRASILEIRAS COM MAIOR POPULAÇÃO', 'sparql', 'cidades_br'],
  ['carros', 'TOP 100 CARROS MAIS RÁPIDOS DO MUNDO (VELOCIDADE MÁXIMA)', 'sparql', 'carros_velocidade'],
  ['esportes', 'TOP 100 MAIORES ARTILHEIROS DE SELEÇÕES DA HISTÓRIA DO FUTEBOL', 'wiki', 'en', "List of top international men's football goalscorers by country"],
  ['diferentes', 'TOP 100 MANGÁS MAIS VENDIDOS DE TODOS OS TEMPOS', 'wiki', 'en', 'List of best-selling manga'],
];
