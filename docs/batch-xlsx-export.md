# Schema do XLSX de exportação em lote (`/api/compare-batch`)

> Localização: `docs/batch-xlsx-export.md`. Índice geral: [README.md](./README.md).

Constantes definidas em `rfq/batch/xlsxSchema.js`. O export é **enxuto**: apenas dados de condições por proposta, inconsistências e metadados técnicos (sem aba de ranking, sem “vencedor sugerido”, sem score na planilha).

## Abas (ordem)

| Ordem | Nome da aba |
|------:|---------------|
| 1 | Condições Gerais |
| 2 | Inconsistências |

## Aba **Condições Gerais**

1. **Tabela principal** — colunas (ordem):

   - Fornecedor / proposta  
   - Arquivo origem  
   - Frete  
   - Total declarado  
   - Total recalculado  
   - Parcelamento  
   - Condição pagamento  
   - Quantidade de avisos (número; não induz decisão)

2. **Distribuição percentual** — linhas com proposta, total recalculado (R$) e % do total (soma dos totais positivos).

3. **Gráfico** — imagem PNG embutida (pizza com aparência 3D), gerada a partir dos totais recalculados; texto de rodapé deixa claro que é só visualização e **não recomenda fornecedor**.

Não há bloco “Metadados do lote” na planilha. Decisões manuais gravadas no histórico podem ainda ser refletidas no XLSX via `patchBatchWorkbookMetadata` (linhas Campo/Valor ao final da aba, apenas se existir fluxo de decisão).

Primeira linha da tabela principal: cabeçalho (congelada, autofiltro).

## Aba **Inconsistências**

Headers (ordem): Arquivo | Fornecedor | Tipo | Detalhe | Severidade

- `severidade` = `blocking` → fundo vermelho claro (bloqueante).
- `severidade` = `error` → fundo rosado.

## Dependência

O gráfico é rasterizado com `@resvg/resvg-js` (SVG → PNG) e embutido via `exceljs` (`addImage`).

## Variáveis de ambiente relacionadas

| Variável | Efeito |
|----------|--------|
| `BATCH_EXPORT_TTL_MS` | Idade máxima do arquivo antes da limpeza (padrão 24h). |
| `BATCH_EXPORT_CLEANUP_INTERVAL_MS` | Intervalo da limpeza periódica (padrão 1h). |
| `BATCH_DOWNLOAD_REQUIRE_TOKEN` | Se `true`, GET `/downloads/...` exige `?token=`. |
| `BATCH_DOWNLOAD_TOKEN_TTL_MS` | Validade do token (padrão 15 min). |
