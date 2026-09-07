# Decisões de desenvolvimento — AutoSync

## Contexto

O AutoSync organiza atendimentos de uma oficina de serviços rápidos. O objetivo
foi entregar primeiro o núcleo solicitado no desafio — formulário público,
persistência, painel protegido, mudança de status e gestão das opções — e
adicionar um diferencial que faça sentido para a rotina da oficina: apoio à
decisão de capacidade e agendamento.

## Stack

| Decisão | Por quê | Trade-off assumido |
| --- | --- | --- |
| React, TypeScript e Vite no frontend | Permite uma interface responsiva, com feedback imediato e tipos para os contratos consumidos da API. | É uma SPA; não há renderização no servidor nem preocupação de SEO nesta entrega. |
| FastAPI no backend | Mantém validações e regras de negócio próximas aos contratos HTTP e oferece documentação interativa para a demonstração. | Frontend e API são serviços separados, o que exige configuração e execução coordenadas. |
| MySQL, SQLAlchemy e Alembic | O domínio tem relações e histórico que se beneficiam de um banco relacional e migrations explícitas. | O ambiente local depende de um banco em container. |
| JWT para um administrador de demonstração | Protege o painel e as rotas administrativas sem aumentar o escopo para múltiplos perfis de usuário. | Não há recuperação de senha, cadastro de administradores ou controle de permissões por função. |
| Docker Compose | Torna reproduzíveis a API, a interface, o MySQL, as migrations e o seed. | Exige Docker Desktop e as portas locais disponíveis. |

## Modelo de negócio

### Status do pedido e andamento da oficina

O desafio exige que o status principal permaneça limitado a PENDENTE,
CONFIRMADO e CANCELADO. Para representar a operação sem desrespeitar essa
regra, o andamento foi separado em estado operacional:
AGENDADO, EM_ANDAMENTO, ATRASADO e CONCLUÍDO.

Ao confirmar um pedido, a administração também cria a alocação de recursos e o
estado inicial AGENDADO. Um box e um funcionário só voltam a ficar disponíveis
quando o atendimento é concluído. Assim, cancelamento, atendimento em curso e
histórico não se confundem.

### Recursos e histórico

Serviços, boxes e funcionários são dados administráveis, não listas fixas no
frontend. A desativação é lógica: o item deixa de aparecer para novos pedidos,
mas continua associado aos registros históricos que já o utilizam.

### Agenda por capacidade

Serviços têm duração em minutos, em vez de blocos de 30 minutos. A API procura
o primeiro intervalo futuro, de segunda a sexta entre 08:00 e 18:00, no qual
box e funcionário estejam simultaneamente livres por toda a duração do
serviço.

A sugestão não confirma nada sozinha. A pessoa administradora pode aceitá-la ou
informar outro intervalo, box e funcionário; em ambos os casos a API repete a
validação contra conflitos. Esse limite deixa a automação explicável e preserva
a decisão humana.

## Diferencial escolhido

A sugestão de capacidade resolve uma necessidade concreta de uma oficina:
evitar confirmar atendimento em um horário sem recurso disponível. Ela foi
priorizada porque cabe no tema, é demonstrável e mantém o fluxo central simples
para quem solicita atendimento.

O seed cria serviços, recursos e atendimentos de exemplo para que a avaliação
possa mostrar tanto o pedido pendente como um agendamento já alocado.

## Estratégia de testes

Os testes automatizados protegem o que não pode quebrar no desafio:

- criação válida e rejeição de dados inválidos;
- proteção do painel e das rotas administrativas sem token;
- confirmação e cancelamento com persistência de status;
- busca, filtro, paginação e gestão de recursos;
- sugestão de vaga, conflito de box ou funcionário e detecção de atraso.

Pytest cobre os contratos e regras da API. Vitest cobre as interações da
interface. A validação no cliente melhora a experiência, mas a API é a fonte de
verdade para dados, permissões, transições de status e agenda.

## Cortes de escopo

Foram deixados de fora, deliberadamente:

- pagamentos e notificações;
- cadastro e autenticação de clientes;
- especialidades por funcionário;
- atendimento longo aguardando peça;
- reagendamento automático em cascata;
- exclusão física de dados;
- múltiplos papéis administrativos e recuperação de senha.

Esses itens ampliariam o produto, mas não são necessários para demonstrar o
núcleo do desafio. Preferi entregar um fluxo completo e verificável a incluir
funções parcialmente acabadas.

## Uso responsável de IA

A IA foi usada como apoio para explorar a modelagem, estruturar tarefas,
revisar implementações, levantar cenários de teste e revisar a documentação.
As decisões de produto, a integração, a validação dos resultados e os limites
de escopo permaneceram sob revisão humana.

Um caso que exigiu correção foi a sugestão inicial de tratar o andamento
operacional como o único status do pedido. A leitura do enunciado mostrou que o
status principal precisava continuar restrito a PENDENTE, CONFIRMADO e
CANCELADO. A solução adotada foi separar estado operacional e status, com
testes para garantir as regras de transição.

Também não foi adotada a ideia de uma agenda automática em blocos fixos. Uma
troca de óleo de 45 minutos deixaria tempo ocioso ou criaria uma alocação
imprecisa. A decisão foi modelar intervalos livres em minutos e manter a
confirmação final com a administração, mesmo quando a API oferece uma sugestão.

### Correções humanas de lacunas da implementação assistida por IA

Nos testes de uso humano, identifiquei que o código inicialmente produzido com
apoio da IA estava incompleto em fluxos administrativos importantes. As
correções foram definidas, implementadas e validadas sob revisão humana:

- O painel permitia agendar, mas não reagendar um atendimento já confirmado.
  Foi adicionado o controle de reagendamento com as mesmas validações de
  disponibilidade.
- A tentativa de iniciar um atendimento antes do horário retornava uma mensagem
  pouco clara e poderia esconder a ação de nova tentativa. O erro passou a
  informar a data e a hora permitidas, mantendo o controle disponível.
- O cancelamento alterava apenas o status principal e deixava visíveis o estado
  `AGENDADO` e os dados de alocação. A correção limpa estado operacional,
  período, box e responsável tanto na persistência quanto no painel.
- Falhas ao carregar ou confirmar um agendamento podiam ocultar o formulário.
  O formulário agora permanece disponível após erro de envio e oferece
  `Tentar novamente` quando os dados de preparação não carregam.
- A API já aceitava reativar serviços, boxes e funcionários com
  `is_active: true`, mas o painel não oferecia essa ação. Foram incluídos
  controles de reativação, feedback e testes para os três tipos de cadastro.
