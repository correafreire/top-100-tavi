# Top 100 TAVI

Jogo multiplayer de rankings TOP 100. Em cada rodada, escreva um item da lista; quanto mais baixo no ranking, mais pontos.

## Rodar

```
npm install
npm start
```

Abra http://localhost:3000, crie uma sala e compartilhe o código de 4 letras.

## Perguntas

- `data/listas.js`: rankings fixos de 100 itens.
- `data/fontes.js`: rankings buscados em tempo real na Wikipédia/Wikidata (cache de 30 dias).
- Na criação da sala há busca livre de rankings na Wikipédia.
- Listas já usadas ficam em `data/used.json` e nunca se repetem.
